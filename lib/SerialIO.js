/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {
  constructor (port) {
    this._sp = require('serialport')
    this._port = this._sp(port)
    this._parser = this._port.pipe(new this._sp.parsers.Readline())
    this._callbacks = {}
    this._parser.on('data', (data) => { this._dataHandler(data) })
  }

  /**
   * Message type enumerator
   *
   * @enum {number}
   */
  static get MESSAGE_TYPE () {
    return Object.freeze({
      UNKNOWN: -1,
      PRINT_TEXT: 0,
      PRINT_BUFFER: 1,
      PRINT_FILE: 2,
      ACK: 10,
      ERROR: 11,
      STATUS: 12
    })
  };

  /**
   * Message key enumerator
   *
   * @enum {number}
   */
  static get KEYS () {
    return Object.freeze({
      'TYPE': 't',
      'DATA': 'd'
    })
  }

  /**
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {string} rawMsg - raw message string
   * @private
   */
  _dataHandler (rawMsg) {
    let pMsg
    console.debug(`> ${rawMsg}`)

    try {
      pMsg = JSON.parse(rawMsg)
    } catch (e) {
      console.error('Unable to parse raw message:', rawMsg)
      return
    }

    const mType = pMsg[SerialIO.KEYS.TYPE]
    const mData = pMsg[SerialIO.KEYS.DATA]

    const cbArray = this._callbacks[mType]
    if (cbArray) {
      cbArray.forEach((cb) => {
        try {
          cb(mData, mType)
        } catch (e) {
          console.warn('calling callback failed:', e, cb)
        }
      })
    }
  }

  /**
   * Callback for `on`, called with each incoming message
   *
   * @callback onMessageCallback
   * @param {*} mData - incoming message data
   * @param {SerialIO.MESSAGE_TYPE} msgType - message type
   */

  /**
   * Subscribes a callback to a message type.
   * Callback will be triggered with each incoming message that has the specified type.
   *
   * @param {SerialIO.MESSAGE_TYPE} msgType - message type the callback should be triggered for
   * @param {function} cb - callback function
   */
  on (msgType, cb) {
    if (!this._callbacks[msgType]) { this._callbacks[msgType] = [] }
    this._callbacks[msgType].push(cb)
  }

  /**
   * Sends the specified message over the serial _port
   *
   * @param {*} data - message body to be sent
   * @param {SerialIO.MESSAGE_TYPE} [msgType] - type of message to be sent, defaults to UNKNOWN
   */
  send (data, msgType = SerialIO.MESSAGE_TYPE.UNKNOWN) {
    // make sure message ends with newline, as it is the message delimiter
    const outMsg = {}
    outMsg[SerialIO.KEYS.TYPE] = msgType
    outMsg[SerialIO.KEYS.DATA] = data
    const outString = JSON.stringify(outMsg) + '\n'

    console.debug(`< ${outString}`)
    this._port.write(outString)
  }
}

module.exports = SerialIO
