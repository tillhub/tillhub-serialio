/**
 * Message class for SerialIO. An instance holds the message data, its type, an id, and whether or not it is a reply.
 */
class Message {

  /**
   * Creates a new Message instance, optionally based on a raw message object
   * @param {object} rawMessage - raw message object
   */
  constructor (rawMessage = undefined) {
    /**
     * @type {*}
     */
    this.data = undefined;

    /**
     * @type {boolean}
     */
    this.reply = false;

    /**
     * @type {Message.TYPE}
     */
    this.type = Message.TYPE.UNKNOWN;

    /**
     * @type {number}
     */
    this.id = -1;

    // TODO: probably needs some kind of validation
    if (rawMessage) {
      Object.entries(rawMessage).forEach(([mKey, mVal]) => {
        switch (mKey) {
          case Message.KEY.TYPE:
            if (Object.values(Message.TYPE).indexOf(mVal) > -1)
              this._type = mVal;
            else
              console.warn(`unknown message type detected: ${mVal}`);
            break;
          case Message.KEY.DATA:
            this._data = mVal;
            break;
          case Message.KEY.REPLY:
            this._reply = mVal === true;
            break;
          case Message.KEY.ID:
            this._id = mVal;
            break;
          default:
            console.warn(`unknown message entry detected! ${mKey}: ${mVal}`);
        }
      });
    }
  }

  /**
   * Message type enumerator
   *
   * @enum {number}
   */
  static get TYPE() {
    return Object.freeze({
      UNKNOWN: -1,
      PRINT_TEXT: 0,
      PRINT_BUFFER: 1,
      PRINT_FILE: 2,
      ACK: 10,
      ERROR: 11,
      STATUS: 12
    });
  }

  /**
   * Message key enumerator
   *
   * @enum {number}
   */
  static get KEY () {
    return Object.freeze({
      TYPE: 't',
      DATA: 'd',
      REPLY: 'r',
      ID : 'i'
    })
  }

  /**
   * Returns the Object representation of this message
   *
   * @returns {object} message as object
   */
  toJSON () {
    const json = {};
    json[Message.KEY.DATA] = this.data;
    json[Message.KEY.ID] = this.id;
    json[Message.KEY.REPLY] = this.reply;
    json[Message.KEY.TYPE] = this.type;

    return json;
  }

  /**
   * Returns the message as a JSON string
   *
   * @returns {string} message as JSON string
   */
  toString () {
    return JSON.stringify(this.toJSON())
  }

  /**
   * (optional) reply function that is set by SerialIO when sending this message initially
   *
   * @param {Message} msg - reply message
   */
  sendReply (msg) {
    throw new Error(`You cannot reply to this message! message:${this.toString()}`);
  }
}

module.exports = Message;
