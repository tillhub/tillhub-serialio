export default class Utils {
    /**
     * Converts a number into its hex representation as string
     * @param {number} d
     * @returns {string}
     */
    static toHex(d: number): string;
    /**
     * Truncates a string to a max length. returns start & end of a string, with dots in between.
     * @param {string} str - string to be truncated
     * @param {number} [mL] - max length of string (default: 100)
     * @returns {string} truncated string if if it exceeds max length, original string otherwise
     */
    static truncate(str: string, mL?: number): string;
}
