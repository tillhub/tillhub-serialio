const startSequence = Buffer.allocUnsafe(4)
startSequence.writeUInt32BE(0xf000000f, 0)

class Utils {
  /**
   * Creates a timestamp in milliseconds, similar to Date.now()
   *
   * @returns {number} current timestamp
   */
  static timestamp () {
    return new Date().getTime()
  }

  /**
   * Converts a number into its hex representation as string
   * @param {number} d
   * @returns {string}
   */
  static toHex (d) {
    return `0x${d.toString(16)}`
  }

  /**
   * The 4-byte start sequence used to detect the start of a SerialIO message
   * @returns {Buffer}
   * @constructor
   */
  static get START_SEQUENCE () {
    return startSequence
  }
}

module.exports = Utils
