const Message = require("./Message");
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
  constructor (port) {
    console.debug("initializing SerialIO on port:", port);
    this._sp = require('serialport');
    this._portString = port;
    this._port = this._sp(port);
    this._parser = this._port.pipe(new this._sp.parsers.Readline());
    this._parser.on('data', (data) => { this._dataHandler(data) });

    /**
     *
     * @type {onMessageHandler}
     * @private
     */
    this._msgHandler = undefined;

    /**
     *
     * @type {Object.<number, {resolve: Function, reject: Function, startTime: number}>}
     * @private
     */
    this._pendingPromises = {};
  }

  /**
   * Returns the next unused id for messages
   *
   * @returns {number} next unused id
   * @private
   */
  static _nextId () {
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
  _dataHandler (rawMsg) {
    console.debug(`${this._portString} > ${rawMsg}`);

    let pMsg;
    try {
      pMsg = new Message(JSON.parse(rawMsg));
    } catch (e) {
      console.error('Unable to parse raw message:', rawMsg);
      return
    }

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
      // add reply function to message

      /**
       * Sends a reply to this message
       *
       * @param {Message} msg - reply message
       * @returns {Promise<Message|undefined>} - promise for sending the reply. Should resolve immediately,
       * but may throw error if sending fails
       */
      pMsg.sendReply = (msg) => {
        msg.id = pMsg.id;
        msg.reply = true;
        return this.send(msg, false);
      };

      // trigger message handler
      if (this._msgHandler) {
        try {
          this._msgHandler(pMsg);
        } catch (e) {
          console.warn("Error while calling message handler:", e);
        }
      } else {
        console.warn("no message handler to handle reply");
      }

    }
  }

  /**
   * Handler for `onMessage`, called with each incoming message (that is not a reply)
   *
   * @callback onMessageHandler
   * @param {Message} msg - incoming message
   */

  /**
   * Sets the handler for incoming messages
   *
   * @param {onMessageHandler} handler
   */
  onMessage(handler) {
    this._msgHandler = handler;
  }

  /**
   * Sends the specified message over the serial _port
   *
   * @param {Message} msg - message to be sent
   * @param {boolean} awaitReply - whether or not to wait for and resolve with a reply.
   * If false, resolves immediately with undefined
   * @returns {Promise<(Message|undefined)>} promise will fulfill with a reply (if awaitReply is true).
   * Throws error on timeout
   */
  send (msg, awaitReply = true) {
    return new Promise((resolve, reject) => {
      if (msg.id === -1) {
        msg.id = SerialIO._nextId();
      }
      const outString = msg.toString();
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


// attach Message class
// SerialIO.Message = Message;

module.exports = SerialIO;
