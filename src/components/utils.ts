export default class Utils {

  /**
   * Converts a number into its hex representation as string
   * @param {number} d
   * @returns {string}
   */
  public static toHex (d: number) {
    return `0x${d.toString(16)}`
  }

  /**
   * Truncates a string to a max length. returns start & end of a string, with dots in between.
   * @param {string} str - string to be truncated
   * @param {number} [mL] - max length of string (default: 100)
   * @returns {string} truncated string if if it exceeds max length, original string otherwise
   */
  public static truncate (str: string, mL: number = 100) {
    if (str.length <= mL) return str

    return `${str.slice(0, Math.floor(mL / 2))}…${str.slice(1 - Math.ceil(mL / 2))}`
  }
}
