
class Message {
  /**
   *
   * @param {Buffer} buf
   */
  constructor (buf) {
    this._d = require('debug')(`serialio:Message:${Math.round(Math.random() * 1000)}`)
    this._d('Message:', buf)
    /** @type {Buffer} */
    this.raw = buf
  }

  /**
   * @returns {number}
   */
  get start () {
    return this.raw.readUInt32BE(0)
  }

  /**
   * @returns {number}
   */
  get length () {
    return this.raw.readUInt32BE(4)
  }

  /**
   * @returns {number}
   */
  get type () {
    return this.raw.readUInt8(8)
  }

  /**
   * @returns {Buffer}
   */
  get data () {
    // reusing data buffer for performance reasons
    if (!this._data) {
      this._data = Buffer.allocUnsafe(this.length)
      this.raw.copy(this._data, 0, 9)
    }

    this._d('returning data:', this._data)
    return this._data
  }
}

module.exports = Message
