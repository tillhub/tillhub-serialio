const REPLY_TIMEOUT = 5000;
const sp = require('serialport');


/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {

  static get MESSAGE_TYPE() {
    return {
      REQUEST: 0,
      REPLY: 0xfe,
      ERROR: 0xff,
    }
  }

  /**
   * Creates a new SerialIO instance bound to the specified serial port
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor(port) {
    console.debug("initializing SerialIO on port:", port);
    this._sp = sp;
    this._portString = port;
    this._port = new this._sp(port, {autoOpen: false});
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

    this._closing = false;
    this._port.on('close', err => this.closeHandler(err));

    this.sending = false;
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
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {string} rawMsg - raw message string
   * @param {number} type - message type
   * @private
   */
  _handleMessage(rawMsg, type) {
    try {
      console.log("_handleMessage");
      console.debug(`${this._portString} > [${type}]: ${rawMsg.substring(0, 120)}… SIZE: ${rawMsg.length} BYTES`);

      let parsedMsg;
      try {
        parsedMsg = JSON.parse(rawMsg)
      } catch (e) {
        console.debug("cannot parse message to JSON");
      }

      if (type >= SerialIO.MESSAGE_TYPE.REPLY) {
        if (this._replyPromise) {
          this._clearReplyTimeout();
          try {
            if (type === SerialIO.MESSAGE_TYPE.REPLY)
              this._replyPromise.resolve(parsedMsg || rawMsg);
            else if (type === SerialIO.MESSAGE_TYPE.ERROR)
              this._replyPromise.reject(rawMsg);
          } catch (e) {
            console.warn("Error while resolving reply promise", e);
          } finally {
            // delete entry after resolving
            this._replyPromise = undefined;
          }
        } else {
          console.debug(`received reply no one is waiting for`);
        }
      } else {
        // check if there is a message handler for this type
        if (this._msgHandler) {
          try {
            this._msgHandler(parsedMsg || rawMsg).then(async (reply) => {
              console.debug("message handler returned with reply");
              try {
                await this.sendReply(reply);
              } catch (e) {
                console.error("sending reply failed", e);
              }
            }).catch(async (err) => {
              console.debug("message handler returned with error:", err);
              try {
                await this.sendErrorReply(err);
              } catch (e) {
                console.error("sending error reply failed", e);
              }
            });
          } catch (e) {
            console.error("error while calling message handler");
            this.sendErrorReply(e).catch((err) => {
              console.error("sending message handler error as reply failed", err);
            });
          }
        } else {
          console.log("No message handler to handle message");
          this.sendErrorReply("No message handler to handle message").catch((err) => {
            console.error("sending missing message handler error as reply failed", err);
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
    if (this._tempBuf && from === 0) {
      data = Buffer.concat([this._tempBuf, data]);
      this._tempBuf = undefined;
    }
    const iStart = data.indexOf(0x00000000, from);
    if (this._buf) {
      const remaining = this._buf.length - this._buf.used;
      console.debug(`filling existing buffer. remaining: ${remaining}b, data: ${data.length - from}b`);

      // check for start sequence, for safety check
      if (remaining >= data.length - from) { // data is smaller/equal rest of buffer
        // console.debug("remaining data is smaller or equal to rest of buffer")
        if (iStart > -1) {
          console.error("new startSequence while current buffer isn't filled yet! Case #1");

          if (this._replyPromise)
            this._replyPromise.reject("Message incomplete. Case #1");

          this._buf = undefined;
          this._parseData(data, iStart);
          return;
        }
        this._buf.used += data.copy(this._buf, this._buf.used, from);

        if (this._buf.used === this._buf.length) {
          console.debug("buffer filled; handling message");
          this._handleMessage(this._buf.toString(), this._buf.type);

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
        this._handleMessage(this._buf.toString(), this._buf.type);

        // there is more data left, so we keep parsing
        this._parseData(data, from + remaining);
      }
    } else {
      const dataRemaining = data.length - from;

      // edge case: rest of data is not long enough to parse buffer length + type
      if (dataRemaining < 9) {
        console.log("data remaining too small, using temp buffer");
        this._tempBuf = Buffer.allocUnsafe(dataRemaining);
        data.copy(this._tempBuf, 0, from);
        return;
      } else if (iStart < 0) {
        console.error(`data contains no start sequence; ${dataRemaining}b will be skipped`);
        return;
      } else if (iStart - from > 0) {
        console.warn(`start sequence in the middle of data. Skipping ${iStart - from}b`)
      }

      const msgLength = data.readUInt32BE(iStart + 4);
      const msgType = data.readUInt8(iStart + 8);
      console.debug(`created new buffer of size ${msgLength} and type ${msgType}, starting from data at index ${iStart}`);

      this._buf = Buffer.allocUnsafe(msgLength);
      this._buf.used = 0;
      this._buf.type = msgType;

      // console.debug(`new buffer: ${data.toString('hex')}`);


      this._parseData(data, iStart + 9)
    }
  }

  /**
   *
   * @param {function} handler - message handler for incoming (initial) messages
   */
  onMessage(handler) {
    this._msgHandler = handler;
  }

  /**
   * Sends a message over the serial bus. Returns a Promise, that may resolve with a reply.
   * @param {string|object} msgBody
   * @param {number} msgType
   * @returns {Promise<string>}
   */
  send(msgBody = "", msgType = SerialIO.MESSAGE_TYPE.REQUEST) {
    return new Promise((resolve, reject) => {


      if (this.sending) {
        return reject("Currently in sending state");
      }
      this.sending = true;

      let outString;

      if (msgBody instanceof Error)
        outString = msgBody.toString();
      else if (typeof msgBody === "object")
        outString = JSON.stringify(msgBody);
      else if (typeof msgBody !== "string")
        outString = msgBody.toString();
      else
        outString = msgBody;

      const sBuf = Buffer.from(outString);
      console.debug(`${this._portString} < [${msgType}] ${msgBody.constructor.name}: ${outString.substring(0, 120)}… SIZE: ${sBuf.length} BYTES`);
      const outBuff = Buffer.alloc(sBuf.length + 9);
      outBuff.writeUInt32BE(0, 0);
      outBuff.writeUInt32BE(sBuf.length, 4);
      outBuff.writeUInt8(msgType, 8);
      sBuf.copy(outBuff, 9);
      // const start = Utils.timestamp();
      // this.writeAndDrain(outBuff);
      this.sendInParts(outBuff);
      // const t = Utils.timestamp() - start;
      // console.log(`wrote to buffer in ${t}ms`);
      if (msgType < SerialIO.MESSAGE_TYPE.REPLY) {
        this._replyPromise = {resolve, reject};
        this._startReplyTimeout();
      } else {
        resolve();
      }
    })
  }

  sendRequest(body) {
    return this.send(body);
  }

  sendReply(body) {
    return this.send(body, SerialIO.MESSAGE_TYPE.REPLY)
  }

  sendErrorReply(body) {
    return this.send(body, SerialIO.MESSAGE_TYPE.ERROR)
  }

  sendInParts(buffer, from = 0) {
    console.log("sendInParts", buffer.length, from, buffer.length - from);
    const partSize = Math.min(1024 * 64, buffer.length);
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
          this._replyPromise.reject("Timeout reached");
        else {
          console.debug("no reply promise to timeout");
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
module.exports = SerialIO;
