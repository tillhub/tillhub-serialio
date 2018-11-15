class Utils {
  /**
   * Creates a timestamp in milliseconds, similar to Date.now()
   *
   * @returns {number} current timestamp
   */
  static timestamp () {
    return new Date().getTime()
  }

  static atob (data) {
    try {
      return atob(data)
    } catch (e) {
      return Buffer.from(data, 'base64').toString()
    }
  }

  static btoa (data) {
    try {
      return btoa(data)
    } catch (e) {
      return Buffer.from(data).toString('base64')
    }
  }
}

module.exports = Utils
