const sp = require('serialport')
const Utils = require('./Utils')
const Message = require('./Message')

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
    this._port = new this._sp(port, { autoOpen: false })
    this._port.on('data', (data) => {
      return this._parseData(data)
    })
    this._port.on('error', (err) => {
      this.d('error event: %s', err)
      if (this._onErrorHandler) {
        try {
          this._onErrorHandler(err)
        } catch (e) {
          this.d('error handler returned with error: %s', e.message || e)
        }
      }
    })
    this._port.on('drain', (err) => {
      this.d('drain event: %s', err)
      if (this._onDrainHandler) {
        try {
          this._onDrainHandler(err)
        } catch (e) {
          this.d('drain handler returned with error: %s', e.message || e)
        }
      }
    })

    this._port.on('open', (err) => {
      this.d('open event: %s', err)
      if (this._onOpenHandler) {
        try {
          this._onOpenHandler(err)
        } catch (e) {
          this.d('open handler returned with error: %s', e.message || e)
        }
      }
    })
    // this.open();

    /**
     * indicates if closing event is intended behaviour
     * @type {boolean}
     * @private
     */
    this._closing = false
    this._port.on('close', err => this._closeHandler(new Error(err)))

    /**
     * Indicates if a message transaction already in progress
     * @type {boolean}
     */
    this.sending = false
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
      this._port.open((err) => {
        if (err === null) {
          resolve()
        } else {
          reject(err)
        }
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
        if (err === null) {
          resolve()
        } else {
          reject(err)
        }
      })
    })
  }

  /**
   * Indicates whether the serial port is open or not.
   * @returns {boolean}
   */
  isOpen () {
    return this._port.isOpen
  }

  /**
   * Sets the message handler invoked with incoming messages. Any return value will be the message body for the reply.
   * @param {function} handler - message handler for incoming (initial) messages
   */
  onMessage (handler) {
    this._onMessageHandler = handler
    // this._parser.onMessage(handler)
  }

  /**
   * Sets a handler to be called on 'error' events of the underlying serial port
   * @param {function} handler
   */
  onError (handler) {
    this._onErrorHandler = handler
  }

  /**
   * Sets a handler to be called on 'drain' events of the underlying serial port
   * @param {function} handler
   */
  onDrain (handler) {
    this._onDrainHandler = handler
  }

  /**
   * Sets a handler to be called on 'close' events of the underlying serial port
   * @param {function} handler
   */
  onClose (handler) {
    this._onCloseHandler = handler
  }

  /**
   * Sets a handler to be called on 'open' events of the underlying serial port
   * @param {function} handler
   */
  onOpen (handler) {
    this._onOpenHandler = handler
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
          this.d('msgBody is not a string, but can\'t be stringified by JSON: %s', e.message)
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
        this.d('failed to send message in parts: %s', e)
        reject(new Error('failed to send message'))
      }
    })
  }

  static createMessageBuffer (sBuf, msgType) {
    // alloc with 9 extra bytes, which are the start sequence and message information
    const outBuff = Buffer.allocUnsafe(sBuf.length + 9)
    Utils.START_SEQUENCE.copy(outBuff, 0) // start sequence
    outBuff.writeUInt32BE(sBuf.length, 4) // message length
    outBuff.writeUInt8(msgType, 8) // message type
    sBuf.copy(outBuff, 9)
    return outBuff
  }

  /**
   * Takes incoming data from the serial port and recursively parses it until all data is consumed.
   * @param {Buffer} data - incoming data from the serial port
   * @private
   */
  _parseData (data) {
    this.b = this.b ? Buffer.concat([this.b, data]) : data

    this.d('parseData2: %db', this.b.length, this.b)
    while (this.b.length > 8) {
      this.d('in while. remaining bytes: %db', this.b.length)
      if (this._mStart === undefined) {
        this.d('start is undefined')
        const nextMsg = this.b.indexOf(Utils.START_SEQUENCE, this._validated)
        if (nextMsg === -1) {
          this.d('found no message, dropping data')
          // nothing found, drop data
          this.b = this.b.slice(this.b.length - 8)
          return
        } else {
          this.d('found message at index %d', nextMsg)
          this.b = this.b.slice(nextMsg)
          this._mStart = 0
          continue
        }
      }

      this._mSize = this.b.readUInt32BE(4)
      this.d('message size: %db', this._mSize)

      // we check if there is a message start in the expected message payload
      const nextNextMsg = this.b.indexOf(Utils.START_SEQUENCE, 4)
      if (nextNextMsg > -1 && nextNextMsg < this._mSize + 9) {
        // new message received before old one completed
        // reset buffer and try again
        this.d('pending message cannot be completed and will be dropped. received: %db, missing: %db', nextNextMsg, this._mSize + 9 - nextNextMsg)
        this.b = this.b.slice(nextNextMsg)
        continue
      }

      if (this.b.length >= this._mSize + 9) {
        this.d('message is complete')
        // message is complete
        let msg = new Message(this.b.slice(0, this._mSize + 9))
        this._handleMessage(msg)
        this.d('slicing buffer. old length: %d, mSize: %d new length: %d', this.b.length, this._mSize, this.b.length - (this._mSize + 9))
        this.b = this.b.slice(this._mSize + 9)
        this._mSize = undefined
      } else {
        // message can't be completed, i.e. return and wait for more data
        this.d('message is incomplete. waiting for more data')
        return
      }
    }

    this.d('parsing while loop ended')
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
      // this.d('_handleMessage')
      this.d(`${this._portString} > [${Utils.toHex(msg.type)}:${msg.data.length}b] ${Utils.truncate(rawString, 120)}`)

      let parsedMsg
      try {
        parsedMsg = JSON.parse(rawString)
      } catch (e) {
        this.d('message is not JSON: %s\n%s', e.message, rawString)
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
            this.d('Error while resolving reply promise: %s', e)
          } finally {
            // delete entry after resolving
            this._replyPromise = undefined
          }
        } else {
          this.d(`received reply no one is waiting for`)
        }
      } else {
        // check if there is a message handler for this type
        if (this._onMessageHandler) {
          (async () => {
            try {
              let reply = this._onMessageHandler(parsedMsg || rawString)
              if (reply instanceof Promise) {
                this.d('message handler returned Promise. Awating reply...')
                reply = await reply
              }
              this.d('message handler returned with reply')
              try {
                await this.sendReply(reply)
              } catch (e) {
                this.d('sending reply failed: %s', e)
              }
            } catch (e) {
              this.d('error while calling message handler')
              this.sendErrorReply(e).catch((err) => {
                this.d('sending message handler error as reply failed: %s', err)
              })
            }
          })()
        } else {
          this.d('No message handler to handle message')
          this.sendErrorReply('No message handler to handle message').catch((err) => {
            this.d('sending missing message handler error as reply failed: %s', err)
          })
        }
      }
    } catch (e) {
      this.d('Unable to handle data: %s', e)
      this.d(`printing raw data:\n${rawString}`)
    }
  }

  /**
   * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
   * @param err - close event error message
   * @private
   */
  _closeHandler (err) {
    // provide handler with additional 'unexpected' flag
    if (this._onCloseHandler) {
      try {
        this._onCloseHandler(err, !this._closing)
      } catch (e) {
        this.d('close handler returned with error: %s', err.message || err)
      }
    }
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
            this.d('reopen attempt failed: %s', e.message)
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
      this.d('sendInParts error on writeAndDrain: %s', e)
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
    // this.d(this._port.write(data))
    // this.d(this._port.drain(cb))
    return new Promise((resolve, reject) => {
      // write...
      this._port.write(data, undefined, (err) => {
        // we still want to drain, so don't resolve yet
        if (err !== null && err !== undefined) {
          reject(err)
        }
      })

      // and drain...
      this._port.drain((err) => {
        if (err === null) {
          resolve()
        } else {
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
    this._clearReplyTimeout()

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
