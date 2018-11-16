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
}

module.exports = Utils
