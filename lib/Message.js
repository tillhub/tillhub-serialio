/**
 * Simple id used to uniquely identify each Message instance
 * @type {number}
 */
let parserId = 0
const nextId = () => {
  const id = parserId++
  // make sure each id is unique (at least long enough for the instance lifetime)
  parserId %= Number.MAX_SAFE_INTEGER
  return id
}

class Message {
  /**
   * Takes a buffer containing the raw message (i.e. start sequence starts at index 0)
   * @param {Buffer} buf
   */
  constructor (buf) {
    // each message gets a unique id, for easier debugging
    this._d = require('debug')(`serialio:Message:${nextId()}`)
    this._d('Message:', buf)
    /** @type {Buffer} */
    this.raw = buf
  }

  /**
   * Returns the start sequence
   * @returns {number}
   */
  get start () {
    return this.raw.readUInt32BE(0)
  }

  /**
   * Returns the message (payload) length (not to be confused with the raw message buffer size)
   * @returns {number}
   */
  get length () {
    return this.raw.readUInt32BE(4)
  }

  /**
   * Returns the message type
   * @returns {number}
   */
  get type () {
    return this.raw.readUInt8(8)
  }

  /**
   * Returns the message payload (i.e. raw message without header)
   * @returns {Buffer}
   */
  get data () {
    // don't know how much overhead slice() produces, so we reuse it after creating it once
    if (!this._data) {
      this._data = this.raw.slice(9)
    }

    return this._data
  }
}

module.exports = Message
