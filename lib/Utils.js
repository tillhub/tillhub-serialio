class Utils {
  /**
   * Creates a timestamp in milliseconds, similar to Date.now()
   *
   * @returns {number} current timestamp
   */
  static timestamp () {
    return new Date().getTime()
  }
}

module.exports = Utils
