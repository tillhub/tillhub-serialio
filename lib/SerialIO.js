const Utils = require("./Utils");

let _id = 0;

/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {

  /**
   * Creates a new SerialIO instance bound to the specified serial port
   *
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor(port) {
    console.debug("initializing SerialIO on port:", port);
    this._sp = require('serialport');
    this._portString = port;
    this._port = new this._sp(port, {autoOpen: false});
    this._parser = this._port.pipe(new this._sp.parsers.Readline());
    this._parser.on('data', (data) => {
      this._dataHandler(data)
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
  }

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

  isOpen() {
    return this._port.isOpen;
  }

  /**
   * Returns the next unused id for messages
   *
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
    console.debug(`${this._portString} > ${rawMsg}`);

    const jMsg = JSON.parse(rawMsg);
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

      // trigger message handler
      // if (this._msgHandler) {
      //   try {
      //     this._msgHandler(pMsg);
      //   } catch (e) {
      //     console.warn("Error while calling message handler:", e);
      //   }
      // } else {
      //   console.warn("no message handler to handle reply");
      // }

      // check if there is a message handler for this type
      const typeMessageHandler = this._msgHandlers[pMsg.type];
      if (typeMessageHandler) {
        try {
          typeMessageHandler(pMsg);
        } catch (e) {
          console.warn(`Error while calling message handler for type ${pMsg.type}:`, e);
        }
      } else {
        console.log(`no message handler for type ${pMsg.type} found`);
      }

      const allTypeMessageHandler = this._msgHandlers["all"];
      if (allTypeMessageHandler) {
        try {
          allTypeMessageHandler(pMsg);
        } catch (e) {
          console.warn("Error while calling generic message handler:", e);
        }
      } else {
        console.log(`no generic message handler found. _msgHandlers: ${this._msgHandlers}`);
      }
    }
  }

  /**
   * Handler for `onMessage`, called with each incoming message (that is not a reply)
   *
   * @callback onMessageHandler
   * @param {SerialIO.Message} msg - incoming message
   */

  /**
   * Sets the handler for incoming messages
   *
   * @param {onMessageHandler} handler
   */
  onMessage(handler) {
    this._msgHandlers["all"] = handler;
  }

  onRead(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.READ] = handler;
  }

  onWrite(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.WRITE] = handler;
  }

  onExecute(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.EXECUTE] = handler;
  }

  onStatus(handler) {
    this._msgHandlers[SerialIO.Message.TYPE.STATUS] = handler;
  }

  /**
   * Sends the specified message over the serial _port
   *
   * @param {SerialIO.Message} msg - message to be sent
   * @param {boolean} awaitReply - whether or not to wait for and resolve with a reply.
   * If false, resolves immediately with undefined
   * @returns {Promise<(SerialIO.Message|undefined)>} promise will fulfill with a reply (if awaitReply is true).
   * Throws error on timeout
   */
  send(msg, awaitReply = true) {
    return new Promise((resolve, reject) => {
      if (msg.id === undefined || msg.id === -1) {
        msg.id = SerialIO._nextId();
      }
      const outString = JSON.stringify(msg);
      console.debug(`${this._portString} < ${outString}`);
      this._port.write(outString + "\n");
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
 */
SerialIO.Message = class Message {

  /**
   * Creates a new Message instance
   */
  constructor() {
    /** @type {boolean} */
    this.reply = false;

    /** @type {number} */
    this.type = Message.TYPE.UNKNOWN;

    /** @type {number} */
    this.id = -1;
  }

  /**
   * @enum {number}
   * @returns {{UNKNOWN: number, READ: number, WRITE: number, EXECUTE: number, STATUS: number}}
   */
  static get TYPE() {
    return {
      UNKNOWN: 0,
      READ: 1,
      WRITE: 2,
      EXECUTE: 3,
      STATUS: 10,
    }
  };

  static FromJSON(json) {
    console.log("FromJSON:", json);
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

    console.log("mTypeClass:", mTypeClass);

    return Object.assign(new mTypeClass, json);
    // return Object.setPrototypeOf(json, mTypeClass.prototype)
  }

  /**
   * (optional) reply function that is set by SerialIO when sending this message initially
   *
   * @param {Message} msg - reply message
   */
  sendReply(msg) {
    throw new Error(`You cannot reply to this message! message:${this.toString()}`);
  }
}


SerialIO.ReadMessage = class ReadMessage extends SerialIO.Message {

  constructor(target) {
    super();
    this.type = SerialIO.Message.TYPE.READ;
    this.target = target;
  }
}

SerialIO.WriteMessage = class WriteMessage extends SerialIO.Message {

  constructor(target, data) {
    super();
    this.type = SerialIO.Message.TYPE.WRITE;
    this.target = target;
    this.data = data;
  }
}

SerialIO.ExecuteMessage = class ExecuteMessage extends SerialIO.Message {

  constructor(name, args) {
    super();
    this.type = SerialIO.Message.TYPE.EXECUTE;
    this.name = name;
    this.args = args;
  }
}

SerialIO.StatusMessage = class StatusMessage extends SerialIO.Message {

  constructor(status, message) {
    super();
    this.type = SerialIO.Message.TYPE.STATUS;
    this.status = status;
    this.message = message;
  }
}

// attach Message class
// SerialIO.Message = Message;

module.exports = SerialIO;
