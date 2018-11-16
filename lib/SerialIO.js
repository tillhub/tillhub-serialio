const REPLY_TIMEOUT = 5000
const sp = require('serialport')
const debug = require('debug')('serialio:serialio')
const Utils = require('./Utils')

/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {
  static get MESSAGE_TYPE () {
    return {
      REQUEST: 0x00,
      REPLY: 0xfe,
      ERROR: 0xff
    }
  }

  /**
   * Creates a new SerialIO instance bound to the specified serial port.
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor (port) {
    debug('initializing SerialIO on port: %s', port)
    this._sp = sp
    this._portString = port
    this._port = new this._sp(port, { autoOpen: false })
    this._port.on('data', (data) => {
      return this._parseData(data)
    })
    this._port.on('error', (err) => {
      debug('SerialIO error event: %s', err)
    })
    this._port.on('drain', (err) => {
      debug('SerialIO drain event: %s', err)
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
   * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
   * @param err - close event error message
   * @private
   */
  _closeHandler (err) {
    if (!this._closing) {
      debug('unexpected closing of port: %s', err)
      this._reopenAttempts = 0
      const connect = () => {
        debug('attempting to reopen port in 1s')
        setTimeout(async () => {
          debug(`reopen attempt #${this._reopenAttempts++}`)
          try {
            await this.open()
            debug(`reopen attempt successful`)
          } catch (e) {
            debug('reopen attempt failed: %s', e.message)
            connect()
          }
        }, 1000)
      }
      connect()
    } else {
      debug('expected closing of port')
    }
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
          reject(new Error(err))
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
          reject(new Error(err))
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
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {string} rawMsg - raw message string
   * @param {number} type - message type
   * @private
   */
  _handleMessage (rawMsg, type) {
    try {
      debug('_handleMessage')
      debug(`${this._portString} > [${Utils.toHex(type)}:${rawMsg.length}b] ${rawMsg.substring(0, 120)}${rawMsg.length > 120 ? '…' : ''}`)

      let parsedMsg
      try {
        parsedMsg = JSON.parse(rawMsg)
      } catch (e) {
        debug('message is not JSON: %s', e.message)
      }

      if (type >= SerialIO.MESSAGE_TYPE.REPLY) {
        if (this._replyPromise) {
          this._clearReplyTimeout()
          try {
            if (type === SerialIO.MESSAGE_TYPE.REPLY) {
              this._replyPromise.resolve(parsedMsg || rawMsg)
            } else if (type === SerialIO.MESSAGE_TYPE.ERROR) {
              this._replyPromise.reject(new Error(rawMsg))
            }
          } catch (e) {
            debug('Error while resolving reply promise: %s', e)
          } finally {
            // delete entry after resolving
            this._replyPromise = undefined
          }
        } else {
          debug(`received reply no one is waiting for`)
        }
      } else {
        // check if there is a message handler for this type
        if (this._msgHandler) {
          (async () => {
            try {
              let reply = this._msgHandler(parsedMsg || rawMsg)
              if (reply instanceof Promise) {
                debug('message handler returned Promise. Awating reply...')
                reply = await reply
              }
              debug('message handler returned with reply')
              try {
                await this.sendReply(reply)
              } catch (e) {
                debug('sending reply failed: %s', e)
              }
            } catch (e) {
              debug('error while calling message handler')
              this.sendErrorReply(e).catch((err) => {
                debug('sending message handler error as reply failed: %s', err)
              })
            }
          })()
        } else {
          debug('No message handler to handle message')
          this.sendErrorReply('No message handler to handle message').catch((err) => {
            debug('sending missing message handler error as reply failed: %s', err)
          })
        }
      }
    } catch (e) {
      debug('Unable to handle data: %s', e)
      debug(`printing raw data:\n${rawMsg}`)
    }
  }

  /**
   * Takes incoming data from the serial port and recursively parses it until all data is consumed.
   * @param {Buffer} data - incoming data from the serial port
   * @param {number} [from] - data offset from where to start/continue parsing data
   * @private
   */
  _parseData (data, from = 0) {
    const iStart = data.indexOf(0x00000000, from)
    debug('_parseData length: %s, from: %s, remaining: %s, iStart: %s', data.length, from, data.length - from, iStart)
    this._startReplyTimeout()

    // check for temp buffer from edge case where initial data was to small to be analyzed
    // and prepend it to incoming data
    if (this._tempBuf && from === 0) {
      data = Buffer.concat([this._tempBuf, data])
      this._tempBuf = undefined
    }

    // create message buffer, if it doesn't exist yet or old one was full
    if (!this._buf || this._buf.used === this._buf.length) {
      const dataRemaining = data.length - from

      // edge case: rest of data is not long enough to parse buffer length + type
      // 4 byte start sequence + 4 byte message length + 1 byte message type = 9 bytes
      if (dataRemaining < 9) {
        debug('data remaining too small, using temp buffer')
        this._tempBuf = Buffer.allocUnsafe(dataRemaining)
        data.copy(this._tempBuf, 0, from)
        return
      } else if (iStart < 0) {
        debug(`data contains no start sequence; ${dataRemaining}b will be skipped`)
        return
      } else if (iStart - from > 0) {
        debug(`start sequence in the middle of data. Skipping ${iStart - from}b`)
      }

      const msgLength = data.readUInt32BE(iStart + 4)
      const msgType = data.readUInt8(iStart + 8)

      this._buf = Buffer.allocUnsafe(msgLength)
      this._buf.used = 0
      this._buf.type = msgType

      debug(`created new ${msgLength}b buffer for message type ${Utils.toHex(msgType)}, starting from data at index ${iStart}`)

      // change the offset, as we have read the first bytes to initiate the message buffer
      from += 9
    }

    const bufRemaining = this._buf.length - this._buf.used
    const dataRemaining = data.length - from
    debug(`filling existing buffer. remaining buffer: ${bufRemaining}b, data: ${dataRemaining}b`)

    // check for start sequence in bytes that are supposed to be copied into message buffer
    // TODO: check if inequalities cover correct range
    if (iStart > from && iStart <= from + Math.min(bufRemaining, dataRemaining)) {
      debug('new start sequence while current buffer isn\'t filled yet. Dropping buffer...')

      // if there is a reply promise, this was probably the reply, so we reject it
      if (this._replyPromise) {
        this._replyPromise.reject(new Error('Message incomplete'))
      }

      this._buf = undefined

      // restart parsing data from new start sequence position
      return this._parseData(data, iStart)
    }

    if (dataRemaining <= bufRemaining) { // data is smaller/equal rest of buffer
      // debug("remaining data is smaller or equal to rest of buffer")
      if (iStart > from) {
        debug('new startSequence while current buffer isn\'t filled yet! Case #1')

        if (this._replyPromise) {
          this._replyPromise.reject(new Error('Message incomplete. Case #1'))
        }

        this._buf = undefined
        return this._parseData(data, iStart)
      }
      // fill buffer with rest of data
      this._buf.used += data.copy(this._buf, this._buf.used, from)

      if (this._buf.used === this._buf.length) {
        debug('buffer filled; handling message (Case #1)')
        try {
          this._handleMessage(this._buf.toString(), this._buf.type)
        } catch (e) {
          debug('Error while trying to handle message: %s', e)
        }
      }
    } else { // data is larger than buffer
      // debug(`remaining data is larger than rest of buffer by ${data.length - from - remaining}`)
      this._buf.used += data.copy(this._buf, this._buf.used, from, from + bufRemaining)

      debug('buffer filled; handling message (Case #2)')
      try {
        this._handleMessage(this._buf.toString(), this._buf.type)
      } catch (e) {
        debug('Error while trying to handle message: %s', e)
      }

      // there is more data left, so we keep parsing
      return this._parseData(data, from + bufRemaining)
    }
  }

  /**
   * Sets the message handler invoked with incoming messages. Any return value will be the message body for the reply.
   * @param {function} handler - message handler for incoming (initial) messages
   */
  onMessage (handler) {
    this._msgHandler = handler
  }

  /**
   * Sends a message over the serial bus. Returns a Promise that may resolve with a reply.
   * @param {string|object} msgBody
   * @param {number} msgType
   * @returns {Promise<string>}
   */
  send (msgBody = '', msgType = SerialIO.MESSAGE_TYPE.REQUEST) {
    debug(`send %s message, type %d`, typeof msgBody, Utils.toHex(msgType))
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
          debug('msgBody is not a string, but can\'t be stringified by JSON: %s', e.message)
          outString = msgBody.toString()
        }
      } else {
        outString = msgBody
      }

      const sBuf = Buffer.from(outString)
      debug(`${this._portString} < [${Utils.toHex(msgType)}:${sBuf.length}b:${msgBody.constructor.name}] ${outString.substring(0, 120)}${outString.length > 120 ? '…' : ''}`)

      // alloc with 9 extra bytes, which are the start sequence and message information
      const outBuff = Buffer.allocUnsafe(sBuf.length + 9)
      outBuff.writeUInt32BE(0, 0) // start sequence
      outBuff.writeUInt32BE(sBuf.length, 4) // message length
      outBuff.writeUInt8(msgType, 8) // message type
      sBuf.copy(outBuff, 9)

      try {
        await this._sendInParts(outBuff)
        // if message is not a reply, we want to wait for one, so we delay the resolve()
        if (msgType < SerialIO.MESSAGE_TYPE.REPLY) {
          this._replyPromise = { resolve, reject }
          this._startReplyTimeout()
        } else {
          resolve()
        }
      } catch (e) {
        debug('failed to send message in parts: %s', e)
        reject(new Error('failed to send message'))
      }
    })
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
   * Sends a buffer by writing smaller chunks of it into the serial port,
   * to workaround a bug of losing data when sending large payloads.
   * @param {Buffer} buffer
   * @param {number} from
   * @private
   */
  async _sendInParts (buffer, from = 0) {
    debug('sendInParts', buffer.length, from, buffer.length - from)
    const partSize = Math.min(1024 * 64, buffer.length)
    const partBuf = Buffer.allocUnsafe(Math.min(partSize, buffer.length - from))
    buffer.copy(partBuf, 0, from, from + partBuf.length)

    try {
      await this._writeAndDrain(partBuf)

      if (buffer.length !== from + partBuf.length) {
        await this._sendInParts(buffer, from + partSize)
      } else {
        debug('sendInParts DONE')
        this.sending = false
      }
    } catch (e) {
      debug('sendInParts error on writeAndDrain: %s', e)
    }
  }

  /**
   * Writes data to the serial port and then drains it.
   * @param {Buffer} data
   * @returns {Promise<void>}
   * @private
   */
  _writeAndDrain (data) {
    debug('writeAndDrain', data.length)
    // debug(this._port.write(data))
    // debug(this._port.drain(cb))
    return new Promise((resolve, reject) => {
      // write...
      this._port.write(data, undefined, (err) => {
        // we still want to drain, so don't resolve yet
        if (err !== null && err !== undefined) {
          reject(new Error(err))
        }
      })

      // and drain...
      this._port.drain((err) => {
        if (err === null) {
          resolve()
        } else {
          reject(new Error(err))
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
          debug('no reply promise to timeout')
        }
      }, REPLY_TIMEOUT)
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
