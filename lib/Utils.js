/** @type {Buffer} */
const startSequence = Buffer.allocUnsafe(4)
startSequence.writeUInt32BE(0xf000000f, 0)

const truncDelimiter = '…'

class Utils {
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

  /**
   * Truncates a string to a max length. returns start & end of a string, with dots in between.
   * @param {string} str - string to be truncated
   * @param {number} [mL] - max length of string (default: 100)
   * @returns {string} truncated string if if it exceeds max length, original string otherwise
   */
  static truncate (str, mL = 100) {
    return str.length <= mL ? str : str.slice(0, Math.floor(mL / 2)) + truncDelimiter + str.slice(1 - Math.ceil(mL / 2))
  }
}

module.exports = Utils
