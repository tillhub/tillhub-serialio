const Utils = require("./Utils");
const REPLY_TIMEOUT = 5000;
const sp = require('serialport');


let _id = 0;
const startSeq = Buffer.from("00000000", "hex");


/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {

  /**
   * Creates a new SerialIO instance bound to the specified serial port
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor(port) {
    console.debug("initializing SerialIO on port:", port);
    this._sp = sp;
    this._portString = port;
    this._port = new this._sp(port, {autoOpen: false, rtscts: true, xon: true, xoff: true, xany: true});
    this._port.on('data', (data) => {
      return this._parseData(data);
    });
    this._port.on('error', (err) => {
      console.error("SerialIO error event:", err);
    });
    this._port.on('drain', (err) => {
      console.warn("SerialIO drain event:", err);
    });

    // this.open();

    /**
     * @private
     */
    this._msgHandlers = {};

    this._closing = false;
    this._port.on('close', err => this.closeHandler(err))

    this._sending = false;
  }

  closeHandler(err) {
    if (!this._closing) {
      console.error("unexpected closing of port!", err);
      console.error("trying to reopen port...");
      this._reopenAttempts = 0;
      const connect = () => {
        console.debug("attempting to reopen port in 1s");
        setTimeout(async () => {
          console.debug(`reopen attempt #${this._reopenAttempts++}`);
          try {
            await this.open();
            console.debug(`reopen attempt successful`)
          } catch (e) {
            console.warn("reopen attempt failed", e);
            connect();
          }
        }, 1000);
      };
      connect();
    } else {
      console.debug("not reopening after expected close");
    }
  }

  /**
   * Tries to open the serial port
   * @returns {Promise<any>}
   */
  open() {
    this._closing = false;
    return new Promise((resolve, reject) => {
      this._port.open((err) => {
        if (err === null) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Closes an opened serial port
   * @returns {Promise<any>}
   */
  close() {
    this._closing = true;
    return new Promise((resolve, reject) => {
      this._port.close((err) => {
        if (err === null) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Indicates whether the serial port is open or not
   * @returns {boolean}
   */
  isOpen() {
    return this._port.isOpen;
  }

  /**
   * Returns the next unused id for messages
   * @returns {number} next unused id
   * @private
   */
  static _nextId() {
    const id = _id;
    // make sure it wraps and stays > -1
    _id = (_id + 1) % Number.MAX_VALUE;
    return id;
  }

  /**
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {string} rawMsg - raw message string
   * @private
   */
  _handleMessage(rawMsg) {
    try {
      console.log("_handleMessage");
      const jMsg = JSON.parse(rawMsg);
      const pMsg = SerialIO.Message.FromJSON(jMsg);
      console.debug(`${this._portString} > #${pMsg.id} ${pMsg.reply ? "(RPLY)" : "(INIT)"} ${pMsg.constructor.name}: ${rawMsg.substring(0, 120)}…`);
      // console.log("parsed message!");
      if (pMsg.reply) {
        if (this._replyPromise) {
          this._clearReplyTimeout();
          try {
            this._replyPromise.resolve(pMsg);
          } catch (e) {
            console.warn("Error while resolving reply promise", e);
          } finally {
            // delete entry after resolving
            this._replyPromise = undefined;
          }
        } else {
          console.warn(`no message waiting for reply #${pMsg.id}!`);
        }
      } else {
        console.log("message is not a reply!");
        // add reply function to message

        /**
         * Sends a reply to this message
         *
         * @param {SerialIO.StatusMessage} msg - reply message
         * @returns {Promise<void>} - promise for sending the reply. Should resolve immediately,
         * but may throw error if sending fails
         */
        pMsg.sendReply = (msg) => {
          msg.id = pMsg.id;
          msg.reply = true;
          return this.send(msg, false);
        };

        // check if there is a message handler for this type
        const messageHandler = this._msgHandlers[pMsg.type] || this._msgHandlers["all"];
        if (messageHandler) {
          try {
            messageHandler(pMsg);
          } catch (e) {
            console.warn(`Error while calling message handler for type ${pMsg.type}:`, e);
            pMsg.sendReply(new SerialIO.StatusMessage("error", `Error while calling message handler for type ${pMsg.type}: ${e.toString()}`)).catch((errReplyResult) => {
              console.error("Unable to send (handler failed) error reply:", errReplyResult);
            });
          }
        } else {
          console.log(`no message handler for type ${pMsg.type}`);
          pMsg.sendReply(new SerialIO.StatusMessage("error", `no message handler for type ${pMsg.type}`)).catch((errReplyResult) => {
            console.error("Unable to send (handler failed) error reply:", errReplyResult);
          });
        }
      }
    } catch (e) {
      console.error("Unable to handle data:", e);
      console.error(`printing raw data:\n${rawMsg}`);
    }
  }

  /**
   *
   * @param {Buffer} data
   * @param {number} [from]
   */
  _parseData(data, from = 0) {
    console.debug("_parseData", data.length, from, data.length - from);
    this._startReplyTimeout();
    const iStart = data.indexOf(0x00000000, from);
    if (this._buf && (this._buf.used !== this._buf.length)) {
      const remaining = this._buf.length - this._buf.used;
      console.debug(`filling existing buffer. remaining: ${remaining}b, data: ${data.length - from}b`);

      // check for start sequence, for safety check
      if (remaining >= data.length - from) { // data is smaller/equal rest of buffer
        // console.debug("remaining data is smaller or equal to rest of buffer")
        if (iStart > -1) {
          console.error("new startSequence while current buffer isn't filled yet! Case #1")

          if (this._replyPromise)
            this._replyPromise.reject("Message incomplete. Case #1");

          this._buf = undefined;
          this._parseData(data, iStart);
          return;
        }
        this._buf.used += data.copy(this._buf, this._buf.used, from);

        if (this._buf.used === this._buf.length) {
          console.debug("buffer filled; handling message");
          this._handleMessage(this._buf.toString());

          this._buf = undefined;
        }

      } else { // data is larger than buffer
        // console.debug(`remaining data is larger than rest of buffer by ${data.length - from - remaining}`)

        // check if iStart is part of bytes that are going to be copied
        if (iStart > from && iStart <= from + remaining) {
          console.error("new startSequence while current buffer isn't filled yet! Case #2");

          if (this._replyPromise)
            this._replyPromise.reject("Message incomplete. Case #2");

          this._buf = undefined;
          this._parseData(data, iStart);
          return;
        }
        this._buf.used += data.copy(this._buf, this._buf.used, from, from + remaining);

        console.debug("buffer filled; handling message");
        this._handleMessage(this._buf.toString());

        // there is more data left, so we keep parsing
        this._parseData(data, from + remaining);
      }
    } else {
      if (iStart < 0) {
        console.error(`data contains no start sequence; ${data.length - from}b will be skipped`);
        return;
      } else if (iStart - from > 0) {
        console.warn(`start sequence in the middle of data. Skipping ${iStart - from}n`)
      }

      this._buf = Buffer.allocUnsafe(data.readUInt32BE(iStart + 4));
      this._buf.used = 0;
      console.debug(`created new buffer of size ${this._buf.length}`);

      this._parseData(data, iStart + 8)
    }
  }

  /**
   * Handler for `onMessage`, called with each incoming message (that is not a reply)
   * @callback onMessageHandler
   * @param {SerialIO.Message} msg - incoming message
   */

  /**
   * Handler for `onRead`, called with each incoming message (that is not a reply)
   * @callback onReadHandler
   * @param {SerialIO.ReadMessage} msg - incoming message
   */

  /**
   * Handler for `onWrite`, called with each incoming message (that is not a reply)
   * @callback onWriteHandler
   * @param {SerialIO.WriteMessage} msg - incoming message
   */

  /**
   * Handler for `onExecute`, called with each incoming message (that is not a reply)
   * @callback onExecuteHandler
   * @param {SerialIO.ExecuteMessage} msg - incoming message
   */

  /**
   * Handler for `onStatus`, called with each incoming message (that is not a reply)
   * @callback onStatusHandler
   * @param {SerialIO.StatusMessage} msg - incoming message
   */

  /**
   * Sets the handler for incoming messages
   * @param {onMessageHandler} handler
   */
  onMessage(handler) {
    this._msgHandlers["all"] = handler;
  }

  /**
   * Sets the handler for incoming messages
   * @param {onReadHandler} handler
   */
  onRead(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.READ] = handler;
  }

  /**
   * Sets the handler for incoming messages
   * @param {onWriteHandler} handler
   */
  onWrite(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.WRITE] = handler;
  }

  /**
   * Sets the handler for incoming messages
   * @param {onExecuteHandler} handler
   */
  onExecute(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.EXECUTE] = handler;
  }

  /**
   * Sets the handler for incoming messages
   * @param {onStatusHandler} handler
   */
  onStatus(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.STATUS] = handler;
  }

  /**
   * Sends the specified message over the serial _port
   *
   * @param {SerialIO.Message|SerialIO.ReadMessage|SerialIO.WriteMessage|SerialIO.ExecuteMessage|SerialIO.StatusMessage} msg - message to be sent
   * @param {boolean} awaitReply - whether or not to wait for and resolve with a reply.
   * If false, resolves immediately with undefined
   * @returns {Promise<StatusMessage|undefined>} promise will fulfill with a reply (if awaitReply is true).
   * Throws error on timeout
   */
  send(msg, awaitReply = true) {
    if (this.sending) {
      return Promise.reject("Currently in sending state");
    }
    this.sending = true;
    return new Promise((resolve, reject) => {
      if (msg.id === undefined || msg.id === -1) {
        msg.id = SerialIO._nextId();
      }
      const outString = JSON.stringify(msg);
      const sBuf = Buffer.from(outString);
      console.debug(`${this._portString} < #${msg.id}${msg.reply ? "/R" : ""} ${msg.constructor.name}: ${outString.substring(0, 120)}… SIZE: ${sBuf.length} BYTES`);
      const outBuff = Buffer.allocUnsafe(sBuf.length + 8);
      outBuff.writeUInt32BE(0, 0);
      outBuff.writeUInt32BE(sBuf.length, 4);
      sBuf.copy(outBuff, 8);
      const start = Utils.timestamp();
      // this.writeAndDrain(outBuff);
      this.sendInParts(outBuff);
      const t = Utils.timestamp() - start;
      console.log(`wrote to buffer in ${t}ms`);
      if (awaitReply) {
        this._replyPromise = {resolve, reject};
        this._startReplyTimeout();
      } else {
        resolve();
      }
    })
  }

  sendInParts(buffer, from = 0) {
    console.log("sendInParts", buffer.length, from, buffer.length - from);
    const partSize = 1024 * 64;
    const partBuf = Buffer.allocUnsafe(Math.min(partSize, buffer.length - from));
    buffer.copy(partBuf, 0, from, from + partBuf.length);
    this.writeAndDrain(partBuf, (err) => {
      console.log("sending next part", err);
      if (buffer.length !== from + partBuf.length) {
        this.sendInParts(buffer, from + partSize);
      } else {
        console.log("sendInParts DONE");
        this.sending = false;
      }
    });
  }

  writeAndDrain(data, cb) {
    console.log("writeAndDrain", data.length);
    console.log(this._port.write(data));
    console.log(this._port.drain(cb));
  }

  _startReplyTimeout() {
    this._clearReplyTimeout();

    if (this._replyPromise) {
      this._replyTimeout = setTimeout(() => {
        if (this._replyPromise)
          this._replyPromise.reject(new SerialIO.StatusMessage(SerialIO.StatusMessage.STATUS_TYPE.ERROR, "Timeout Reached"));
        else {
          console.warn("no reply promise to timeout");
        }
      }, REPLY_TIMEOUT)
    }
  }

  _clearReplyTimeout() {
    if (this._replyTimeout)
      clearTimeout(this._replyTimeout);

    this._replyTimeout = undefined;
  }
}

/**
 * Message class for SerialIO. An instance holds the message data, its type, an id, and whether or not it is a reply.
 * @type {SerialIO.Message}
 */
SerialIO.Message = class Message {

  /**
   * Creates a new Message instance
   */
  constructor() {
    /** @type {boolean} */
    this.reply = false;

    /** @type {string} */
    this.type = SerialIO.Message.TYPE.UNKNOWN;

    /** @type {number} */
    this.id = -1;
  }

  /**
   * @enum {string}
   * @returns {{UNKNOWN: string, READ: string, WRITE: string, EXECUTE: string, STATUS_TYPE: string}}
   */
  static get TYPE() {
    return {
      UNKNOWN: "unknown",
      READ: "read",
      WRITE: "write",
      EXECUTE: "execute",
      STATUS: "status",
    }
  };

  /**
   * Takes a json object and converts is to one of the Message subclasses.
   * Throws an error if message type is missing or UNKNOWN
   * @param {Object} json
   * @returns {SerialIO.ReadMessage|SerialIO.WriteMessage|SerialIO.ExecuteMessage|SerialIO.StatusMessage}
   */
  static FromJSON(json) {
    // console.log("FromJSON:", json);
    let mTypeClass;
    switch (json.type) {
      case SerialIO.Message.TYPE.READ:
        mTypeClass = SerialIO.ReadMessage;
        break;
      case SerialIO.Message.TYPE.WRITE:
        mTypeClass = SerialIO.WriteMessage;
        break;
      case SerialIO.Message.TYPE.EXECUTE:
        mTypeClass = SerialIO.ExecuteMessage;
        break;
      case SerialIO.Message.TYPE.STATUS:
        mTypeClass = SerialIO.StatusMessage;
        break;
      case SerialIO.Message.TYPE.UNKNOWN:
      default:
        throw new Error(`Invalid Message type: ${json.type}`);
    }

    // console.log("mTypeClass:", mTypeClass);

    return Object.assign(new mTypeClass, json);
    // return Object.setPrototypeOf(json, mTypeClass.prototype)
  }

  /**
   * (optional) reply function that is set by SerialIO when sending this message initially
   *
   * @param {SerialIO.StatusMessage} msg - reply message
   */
  async sendReply(msg) {
    throw new Error(`You cannot reply to this message! message:${this.toString()}`);
  }
}

/**
 * Subclass of Message for Read requests
 * @type {SerialIO.ReadMessage}
 */
SerialIO.ReadMessage = class ReadMessage extends SerialIO.Message {

  constructor(target) {
    super();
    this.type = SerialIO.Message.TYPE.READ;
    this.target = target;
  }
}

/**
 * Subclass of Message for Write requests
 * @type {SerialIO.WriteMessage}
 */
SerialIO.WriteMessage = class WriteMessage extends SerialIO.Message {

  constructor(target, data) {
    super();
    this.type = SerialIO.Message.TYPE.WRITE;
    this.target = target;
    this.data = data;
  }
}

/**
 * Subclass of Message for Execute requests
 * @type {SerialIO.ExecuteMessage}
 */
SerialIO.ExecuteMessage = class ExecuteMessage extends SerialIO.Message {

  constructor(name, args) {
    super();
    this.type = SerialIO.Message.TYPE.EXECUTE;
    this.name = name;
    this.args = args;
  }
}

/**
 * Subclass of Message for Status requests. Usually used as type for replies and notifications
 * @type {SerialIO.StatusMessage}
 */
SerialIO.StatusMessage = class StatusMessage extends SerialIO.Message {
  /**
   * @enum {string}
   * @returns {{SUCCESS: string, ERROR: string, NOTIFICATION: string}}
   * @constructor
   */
  static get STATUS_TYPE() {
    return {
      SUCCESS: "success",
      ERROR: "error",
      NOTIFICATION: "notification"
    }
  };

  constructor(status, message) {
    super();
    this.type = SerialIO.Message.TYPE.STATUS;

    /** @type {SerialIO.StatusMessage.STATUS_TYPE} */
    this.status = status;

    /** @ŧype {string|{*}} */
    this.message = message;
  }
};

module.exports = SerialIO;
