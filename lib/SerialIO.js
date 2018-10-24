const Utils = require("./Utils");
const MSG_TIMEOUT = 10000;
const sp = require('serialport');


let _id = 0;


/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {

  static getSerialPort() {
    return sp;
  }

  /**
   * Creates a new SerialIO instance bound to the specified serial port
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor(port) {
    console.debug("initializing SerialIO on port:", port);
    this._sp = sp;
    this._portString = port;
    this._port = new this._sp(port, {autoOpen: false, baudRate: 110});
    this._parser = this._port.pipe(new this._sp.parsers.Readline());
    this._parser.on('data', (data) => {
      this._dataHandler(data);
    });
    this._parser.on('error', (err) => {
      console.error("SerialIO error event:", err);
    });
    this._parser.on('drain', (err) => {
      console.warn("SerialIO drain event:", err);
    });
    this._parser.on('error', (err) => {
      console.error("SerialIO Error event:", err);
    });

    // this.open();

    /**
     *
     * @private
     */
    this._msgHandlers = {};

    /**
     *
     * @type {Object.<number, {resolve: Function, reject: Function, startTime: number}>}
     * @private
     */
    this._pendingPromises = {};

    const timoutCheckerId = setInterval(() => {
      // console.log("timeout checker running")
      // while(true) {
      //   console.log("iterating:", this._pendingPromises.length, this._pendingPromises);
      //   const ppEntry = this._pendingPromises[0];
      //   // console.log("ppEntry:", ppEntry);
      //   if (ppEntry !== undefined) {
      //     const pTimestamp = ppEntry[0];
      //     const pPromise = ppEntry[1];
      //     const elapsedTime = Utils.timestamp() - pTimestamp;
      //     if (elapsedTime > MSG_TIMEOUT) {
      //       console.log(`timeout reached for msg #${pPromise.id}: ${elapsedTime}ms > ${MSG_TIMEOUT}`);
      //       this._pendingPromises.shift();
      //       pPromise.reject("Timeout reached");
      //     } else {
      //       // as the array is ordered by timestamp,
      //       // we can return after the first entry that has not reached timeout yet,
      //       // as all subsequent entries have been added later
      //       return;
      //     }
      //   } else {
      //     return;
      //   }
      // }
      for (const ppId of Object.keys(this._pendingPromises)) {
        const pp = this._pendingPromises[ppId];
        const elapsedTime = Utils.timestamp() - pp.startTime;
        if (elapsedTime > MSG_TIMEOUT) {
          console.log(`timeout reached for msg #${ppId}: ${elapsedTime}ms > ${MSG_TIMEOUT}`);
          delete this._pendingPromises[ppId];
          pp.reject("Timeout reached");
        }
      }
    }, 1000)
  }

  /**
   * Tries to open the serial port
   * @returns {Promise<any>}
   */
  open() {
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
  _dataHandler(rawMsg) {
    try {
      console.log("got rawMsg. type:", typeof rawMsg);
      console.log("got rawMsg. length:", rawMsg.length);
      // console.log("printing...:", msgBuffer.toString());
      // console.log("buffer converted:", Buffer.from(msgBuffer, 'base64').toString());
      // const rawMsg = Utils.atob(msgBuffer);
      // console.log("printing...:", rawMsg);
      // const rawMsg = msgBuffer.toString();
      console.debug(`${this._portString} > ${rawMsg.substring(0, 120)}…`);

      const jMsg = JSON.parse(rawMsg);
      // const jMsg = JSON.parse(rawMsg);
      console.log("I was able to parse it from a json string");

      const pMsg = SerialIO.Message.FromJSON(jMsg);
      console.log("parsed message!");
      if (pMsg.reply) {
        // find initial message and resolve promise
        const msgPromise = this._pendingPromises[pMsg.id]
        if (msgPromise) {
          msgPromise.resolve(pMsg);
          // delete entry after resolving
          delete this._pendingPromises[pMsg.id];
        } else {
          console.warn(`no message waiting for reply #${pMsg.id}!`);
          return
        }
      } else {
        console.log("message is not a reply!");
        // add reply function to message

        /**
         * Sends a reply to this message
         *
         * @param {SerialIO.Message} msg - reply message
         * @returns {Promise<SerialIO.Message|undefined>} - promise for sending the reply. Should resolve immediately,
         * but may throw error if sending fails
         */
        pMsg.sendReply = (msg) => {
          msg.id = pMsg.id;
          msg.reply = true;
          return this.send(msg, false);
        };

        // check if there is a message handler for this type
        const messageHJandler = this._msgHandlers[pMsg.type] || this._msgHandlers["all"];
        if (messageHJandler) {
          try {
            messageHJandler(pMsg);
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
   * @returns {Promise<any>} promise will fulfill with a reply (if awaitReply is true).
   * Throws error on timeout
   */
  send(msg, awaitReply = true) {
    return new Promise((resolve, reject) => {
      if (msg.id === undefined || msg.id === -1) {
        msg.id = SerialIO._nextId();
      }
      const outString = JSON.stringify(msg);
      console.debug(`${this._portString} < ${outString.substring(0, 120)}…`);

      const start = Utils.timestamp();
      // const encoded = Utils.btoa(outString);
      console.log(`baud rate is: ${this._port.baudRate}`);
      console.log(`sending: ${outString}`);
      this._port.write(outString + "\n");
      // this._port.write(outString);
      // this._port.write("\n");
      // this._port.write("\0");
      const t = Utils.timestamp() - start;
      console.log(`wrote to buffer in ${t}ms`);
      // depending on awaitReply, add to pending promises, or resolve immediately
      if (awaitReply) {
        this._pendingPromises[msg.id] = {resolve, reject, startTime: Utils.timestamp()}
      } else {
        resolve();
      }
    })
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
   * @returns {{UNKNOWN: string, READ: string, WRITE: string, EXECUTE: string, STATUS: string}}
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
   * @param {Message} msg - reply message
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
   */
  static get STATUS() {
    return {
      SUCCESS: "success",
      ERROR: "error",
      NOTIFICATION: "notification"
    }
  };

  constructor(status, message) {
    super();
    this.type = SerialIO.Message.TYPE.STATUS;

    /** @type {SerialIO.StatusMessage.STATUS} */
    this.status = status;

    /** @ŧype {string|{*}} */
    this.message = message;
  }
};

module.exports = SerialIO;
