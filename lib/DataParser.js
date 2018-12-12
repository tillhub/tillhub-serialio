const Utils = require('./Utils')
const Message = require('./Message')

/**
 * Simple id used to uniquely identify each DataParser instance
 * @type {number}
 */
let parserId = 0
const nextId = () => {
  const id = parserId++
  // make sure each id is unique (at least long enough for the instance lifetime)
  parserId %= Number.MAX_SAFE_INTEGER
  return id
}
/**
 * The DataParser can parse data streams in form of buffers, and extract SerialIO messages out of them.
 */
class DataParser {
  constructor () {
    this.d = require('debug')(`serialio:DataParser:${nextId()}`)

    /** @type {Buffer} */
    this._buffer = undefined

    /** @type {onMessageHandler} */
    this._onMessageHandler = undefined
  }

  /**
   * Callback called on each new parsed message
   *
   * @callback onMessageHandler
   * @param {Message} message
   */

  /**
   * Sets the handler to be called when a new message has been parsed
   * @param {onMessageHandler} handler
   */
  onMessage (handler) {
    this._onMessageHandler = handler
  }

  /**
   * Calls the onMessage handler with the specified message. Does not throw an error.
   * @param {Message} msg
   * @returns {Promise<void>}
   * @private
   */
  async _callOnMessageHandler (msg) {
    if (this._onMessageHandler) {
      try {
        await this._onMessageHandler(msg)
      } catch (e) {
        this.d('calling onMessage handler failed: %s', e.message || e)
      }
    } else {
      this.d('no message handler defined')
    }
  }

  /**
   * Takes incoming data from the serial port and parses it until all data is consumed.
   * @param {Buffer} data - incoming data from the serial port
   */
  parseData (data) {
    // append new data to existing buffer
    this._buffer = this._buffer ? Buffer.concat([this._buffer, data]) : data

    this.d('parsing data: %dB, buffer: %dB', data.length, this._buffer.length, this._buffer)
    while (this._buffer.length > 8) { // header is 9 bytes -> only parse if we have at least 9 bytes to work with
      this.d('looping. remaining bytes: %dB', this._buffer.length)
      if (!this._pendingMessage) {
        const nextMsg = this._buffer.indexOf(Utils.START_SEQUENCE)
        if (nextMsg === -1) {
          this.d('found no message, dropping data')
          // nothing found, drop data
          // worst case, all but 1b of start sequence are in buffer already
          // that's why we keep the last <start_seq> - 1 bytes
          this._buffer = this._buffer.slice(this._buffer.length - Utils.START_SEQUENCE - 1)
          break
        } else {
          this.d('found message at index %d', nextMsg)
          this._buffer = this._buffer.slice(nextMsg)
          this._pendingMessage = true
          continue // adapted buffer, so rerun loop
        }
      }

      // extract length
      let mLength = this._buffer.readUInt32BE(4)
      this._mSize = mLength + 9 // length + header ( 4b start seq, 4b length, 1b type)
      this.d('message payload length: %dB -> raw size: %dB', mLength, this._mSize)

      // we check if there is a message start in the expected message payload
      const nextNextMsg = this._buffer.indexOf(Utils.START_SEQUENCE, 4)
      if (nextNextMsg > -1 && nextNextMsg < this._mSize) {
        // new message received before old one completed
        // reset buffer and try again
        this.d('pending message cannot be completed and will be dropped. received: %dB, missing: %dB', nextNextMsg, this._mSize - nextNextMsg)
        this._buffer = this._buffer.slice(nextNextMsg)
        continue
      }

      if (this._buffer.length >= this._mSize) {
        this.d('message is complete')
        // message is complete
        let msg = new Message(this._buffer.slice(0, this._mSize))
        this._callOnMessageHandler(msg).catch(e => this.d('onMessage handler caller failed: %s', e.message || e))
        this._buffer = this._buffer.slice(this._mSize)
        this._pendingMessage = false
      } else {
        // message can't be completed, i.e. return and wait for more data
        this.d('message is incomplete. waiting for more data')
        break
      }
    }

    this.d('loop done')
  }
}

module.exports = DataParser
