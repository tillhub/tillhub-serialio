const sp = require('serialport')
const Utils = require('./Utils')
// const Message = require('./Message')
const DataParser = require('./DataParser')

/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {
  /**
   * Creates a new SerialIO instance bound to the specified serial port.
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor (port) {
    this.d = require('debug')(`serialio:serialio:${port}`)
    this.d('initializing SerialIO on port: %s', port)
    this._sp = sp
    this._portString = port

    /**
     * Indicates if a message transaction is in progress
     * @type {boolean}
     */
    this.sending = false

    /**
     * indicates if closing event is intended behaviour
     * @type {boolean}
     * @private
     */
    this._closing = false

    /**
     * Holds event handlers
     * @type {Object.<string, function>}
     * @private
     */
    this._handlers = {}
  }

  /**
   * Prepares the serialport (without opening it). May throw an error, if the target port does not exist
   */
  preparePort () {
    this._port = new this._sp(this._portString, { autoOpen: false })
    this._parser = new DataParser()
    this._parser.onMessage((msg) => this._handleMessage(msg))
    this._port.on('data', data => {
      try { this._parser.parseData(data) } catch (e) { this.d('parsing data failed: %s', e.message || e) }
    })
    this._port.on('error', err => {
      this.d('error event: %s', err)
      if (this._handlers.error) {
        try { this._handlers.error(err) } catch (e) { this.d('error handler returned with error: %s', e.message || e) }
      }
    })
    this._port.on('drain', err => {
      this.d('drain event: %s', err)
      if (this._handlers.drain) {
        try { this._handlers.drain(err) } catch (e) { this.d('drain handler returned with error: %s', e.message || e) }
      }
    })

    this._port.on('open', err => {
      this.d('open event: %s', err)
      if (this._handlers.open) {
        try { this._handlers.open(err) } catch (e) { this.d('open handler returned with error: %s', e.message || e) }
      }
    })
    this._port.on('close', err => {
      this.d('close event: %s', err)
      if (this._handlers.close) {
        // provide handler with additional 'unexpected' flag
        try { this._handlers.close(err, !this._closing) } catch (e) { this.d('close handler returned with error: %s', e.message || e) }
      }
      this._closeHandler(new Error(err))
    })
  }

  /**
   * SerialIO message types
   * @returns {{REQUEST: number, ERROR: number, REPLY: number}}
   * @constructor
   */
  static get MESSAGE_TYPE () {
    return {
      REQUEST: 0x00,
      REPLY: 0xfe,
      ERROR: 0xff
    }
  }

  /**
   * Returns the default reply timeout
   * @returns {number}
   * @constructor
   */
  static get REPLY_TIMEOUT () {
    return 5000
  }

  /**
   * Tries to open the serial port.
   * @returns {Promise<void>}
   */
  open () {
    this._closing = false
    return new Promise((resolve, reject) => {
      // check if port needs to be prepared first
      if (!this._port) {
        try {
          this.preparePort()
        } catch (e) {
          this.d('preparing port failed: %s', e.message || e)
          reject(e)
          return
        }
      }

      this._port.open((e) => {
        if (e === null) { resolve() } else { this.d('opening port failed: %s', e.message || e); reject(e) }
      })
    })
  }

  /**
   * Closes an opened serial port
   * @returns {Promise<void>}
   */
  close () {
    this._closing = true
    return new Promise((resolve, reject) => {
      this._port.close((err) => {
        if (err === null) { resolve() } else { reject(err) }
      })
    })
  }

  /**
   * Indicates whether the serial port is open or not.
   * @returns {boolean}
   */
  isOpen () {
    if (!this._port) return false

    return this._port.isOpen
  }

  /**
   * Callback called on each new parsed message
   *
   * @callback onMessageHandler
   * @param {object|string} message
   */

  /**
   * Callback called on each open event
   *
   * @callback onOpenHandler
   */

  /**
   * Callback called on each close event
   *
   * @callback onCloseHandler
   * @param {Error|undefined} error
   * @param {boolean} expected - whether or not this close event was expected, i.e. invoked by user
   */

  /**
   * Callback called on each drain event
   *
   * @callback onDrainHandler
   * @param {Error|undefined} error
   */

  /**
   * Callback called on each error event
   *
   * @callback onErrorHandler
   * @param {Error|undefined} error
   */

  /**
   * Sets the handler to be called when a new message has been received
   * @param {onMessageHandler} handler
   */
  onMessage (handler) {
    this._handlers.message = handler
  }

  /**
   * Sets a handler to be called on 'error' events of the underlying serial port
   * @param {onErrorHandler} handler
   */
  onError (handler) {
    this._handlers.error = handler
  }

  /**
   * Sets a handler to be called on 'drain' events of the underlying serial port
   * @param {onDrainHandler} handler
   */
  onDrain (handler) {
    this._handlers.drain = handler
  }

  /**
   * Sets a handler to be called on 'close' events of the underlying serial port
   * @param {onCloseHandler} handler
   */
  onClose (handler) {
    this._handlers.close = handler
  }

  /**
   * Sets a handler to be called on 'open' events of the underlying serial port
   * @param {onOpenHandler} handler
   */
  onOpen (handler) {
    this._handlers.open = handler
  }

  /**
   * Send a request with a message body
   * @param {string|object|Error} body
   * @returns {Promise<string>}
   */
  sendRequest (body) {
    return this.send(body)
  }

  /**
   * Send a (success) reply
   * @param {string|object|Error} body
   * @returns {Promise<string>}
   */
  sendReply (body) {
    return this.send(body, SerialIO.MESSAGE_TYPE.REPLY)
  }

  /**
   * Send an error reply
   * @param {string|object|Error} body
   * @returns {Promise<string>}
   */
  sendErrorReply (body) {
    return this.send(body, SerialIO.MESSAGE_TYPE.ERROR)
  }

  /**
   * Sends a message over the serial bus. Returns a Promise that may resolve with a reply.
   * @param {string|object} msgBody
   * @param {number} msgType
   * @returns {Promise<string>}
   */
  send (msgBody = '', msgType = SerialIO.MESSAGE_TYPE.REQUEST) {
    this.d(`send %s message, type %s`, typeof msgBody, Utils.toHex(msgType))
    return new Promise(async (resolve, reject) => {
      if (this.sending) {
        return reject(new Error('Currently in sending state'))
      }
      this.sending = true

      // handle a few special message body cases, e.g. Error instances
      let outString
      if (msgBody instanceof Error) {
        outString = msgBody.message
      } else if (typeof msgBody !== 'string') {
        try {
          outString = JSON.stringify(msgBody)
        } catch (e) {
          this.d('msgBody is not a string, but can\'t be stringified by JSON: %s', e.message || e)
          outString = msgBody.toString()
        }
      } else {
        outString = msgBody
      }

      const sBuf = Buffer.from(outString)
      this.d(`${this._portString} < [${Utils.toHex(msgType)}:${sBuf.length}b:${msgBody.constructor.name}] ${Utils.truncate(sBuf.toString(), 120)}`)

      const msgBuf = SerialIO.createMessageBuffer(sBuf, msgType)

      try {
        await this._sendInParts(msgBuf)
        // if message is not a reply, we want to wait for one, so we delay the resolve()
        if (msgType < SerialIO.MESSAGE_TYPE.REPLY) {
          this._replyPromise = { resolve, reject }
          this._startReplyTimeout()
        } else {
          resolve()
        }
      } catch (e) {
        this.d('failed to send message in parts: %s', e.message || e)
        reject(new Error('failed to send message'))
      }
    })
  }

  /**
   * Creates a message buffer containing the message header and payload
   * @param {Buffer} stringBuffer - string buffer of message payload
   * @param  {number} msgType
   * @returns {Buffer} - buffer containing message header & payload
   */
  static createMessageBuffer (stringBuffer, msgType) {
    // alloc with 9 extra bytes, which are the start sequence and message information
    const outBuff = Buffer.allocUnsafe(stringBuffer.length + 9)
    Utils.START_SEQUENCE.copy(outBuff, 0) // start sequence
    outBuff.writeUInt32BE(stringBuffer.length, 4) // message length
    outBuff.writeUInt8(msgType, 8) // message type
    stringBuffer.copy(outBuff, 9)
    return outBuff
  }

  /**
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {Message} msg - raw message string
   * @private
   */
  _handleMessage (msg) {
    const rawString = msg.data.toString()
    try {
      this.d(`${this._portString} > [${Utils.toHex(msg.type)}:${msg.data.length}b] ${Utils.truncate(rawString, 120)}`)

      let parsedMsg
      try {
        parsedMsg = JSON.parse(rawString)
      } catch (e) {
        this.d('message is not JSON. error: %s, raw: %s', e.message || e)
      }

      if (msg.type >= SerialIO.MESSAGE_TYPE.REPLY) {
        if (this._replyPromise) {
          this._clearReplyTimeout()
          try {
            if (msg.type === SerialIO.MESSAGE_TYPE.REPLY) {
              this._replyPromise.resolve(parsedMsg || rawString)
            } else if (msg.type === SerialIO.MESSAGE_TYPE.ERROR) {
              this._replyPromise.reject(new Error(rawString))
            }
          } catch (e) {
            this.d('Error while resolving reply promise: %s', e.message || e)
          } finally {
            // delete entry after resolving
            this._replyPromise = undefined
          }
        } else {
          this.d(`received reply no one is waiting for`)
        }
      } else {
        // check if there is a message handler for this type
        if (this._handlers.message) {
          (async () => {
            try {
              let reply = await this._handlers.message(parsedMsg || rawString)
              this.d('message handler returned with reply')
              this.sendReply(reply).catch(
                e => this.d('sending reply failed: %s', e.message || e)
              )
            } catch (e) {
              this.d('error while calling message handler')
              this.sendErrorReply(e).catch(
                (err) => this.d('sending message handler error as reply failed: %s', err.message || err)
              )
            }
          })()
        } else {
          this.d('No message handler to handle message')
          this.sendErrorReply('No message handler to handle message').catch((err) =>
            this.d('sending missing message handler error as reply failed: %s', err.message || err)
          )
        }
      }
    } catch (e) {
      this.d('Unable to handle data error: %s, data: %s', e.message || e, rawString)
    }
  }

  /**
   * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
   * @param {Error} err - close event error message
   * @private
   */
  _closeHandler (err) {
    if (!this._closing) {
      this.d('unexpected closing of port: %s', err.message || err)
      this._reopenAttempts = 0
      const connect = () => {
        this.d('attempting to reopen port in 1s')
        setTimeout(async () => {
          this.d(`reopen attempt #${this._reopenAttempts++}`)
          try {
            await this.open()
            this.d(`reopen attempt successful`)
          } catch (e) {
            this.d('reopen attempt failed: %s', e.message || e)
            connect()
          }
        }, 1000)
      }
      connect()
    } else {
      this.d('expected closing of port')
    }
  }

  /**
   * Sends a buffer by writing smaller chunks of it into the serial port,
   * to workaround a bug of losing data when sending large payloads.
   * @param {Buffer} buffer
   * @param {number} from
   * @private
   */
  async _sendInParts (buffer, from = 0) {
    this.d('sendInParts', buffer.length, from, buffer.length - from)
    const partSize = Math.min(1024 * 64, buffer.length)
    const partBuf = Buffer.allocUnsafe(Math.min(partSize, buffer.length - from))
    buffer.copy(partBuf, 0, from, from + partBuf.length)

    try {
      await this._writeAndDrain(partBuf)

      if (buffer.length !== from + partBuf.length) {
        await this._sendInParts(buffer, from + partSize)
      } else {
        this.d('sendInParts DONE')
        this.sending = false
      }
    } catch (e) {
      this.d('sendInParts error on writeAndDrain: %s', e.message || e)
    }
  }

  /**
   * Writes data to the serial port and then drains it.
   * @param {Buffer} data
   * @returns {Promise<void>}
   * @private
   */
  _writeAndDrain (data) {
    this.d('writeAndDrain', data.length)
    return new Promise((resolve, reject) => {
      // write...
      this._port.write(data, undefined, (err) => {
        // we still want to drain, so don't resolve yet
        // don't know if we need both checks, but I probably put it in for a reason
        if (err !== null && err !== undefined) {
          this.d('write failed: %s', err.message || err)
          reject(err)
        }
      })

      // and drain...
      this._port.drain((err) => {
        if (err === null) {
          resolve()
        } else {
          this.d('drain failed: %s', err.message || err)
          reject(err)
        }
      })
    })
  }

  /**
   * (Re-)starts the reply timeout. After a timeout the replyPromise is rejected
   * @private
   */
  _startReplyTimeout () {
    // clear potentially existing timeout
    this._clearReplyTimeout()

    // only start it if a reply promise exists
    if (this._replyPromise) {
      this._replyTimeout = setTimeout(() => {
        if (this._replyPromise) {
          this._replyPromise.reject(new Error('Timeout reached'))
        } else {
          this.d('no reply promise to timeout')
        }
      }, SerialIO.REPLY_TIMEOUT)
    }
  }

  /**
   * Clears an existing reply timeout.
   * @private
   */
  _clearReplyTimeout () {
    if (this._replyTimeout) {
      clearTimeout(this._replyTimeout)
    }

    this._replyTimeout = undefined
  }
}

module.exports = SerialIO
