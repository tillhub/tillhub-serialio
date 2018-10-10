/**
 * Message type enumerator
 *
 * @enum {number}
 */
const MESSAGE_TYPE = Object.freeze({
  UNKNOWN: -1,
  PRINT_TEXT: 0,
  PRINT_BUFFER: 1,
  PRINT_FILE: 2,
  ACK: 10,
  ERROR: 11,
  STATUS: 12
})

class Message {
  static _id = 0;
  _m = {
    t: MESSAGE_TYPE.UNKNOWN
  }
  constructor (msg = undefined) {
    // TODO: probably needs some kind of validation

    if (msg) { this._m = msg }
  }

  get type () {
    return this._m.t
  }

  set type (type) {
    this._m.t = type
  }

  static nextId () {
    return Message._id++
  }

  toJSON () {
    if (this._m.i === undefined) { this._m.i = Message.nextId() }

    return this._m
  }

  toString () {
    return JSON.stringify(this.toJSON())
  }
}

class PrintMessage extends Message {
  constructor (msg) {
    if (msg) {
      const validTypes = [MESSAGE_TYPE.PRINT_TEXT, MESSAGE_TYPE.PRINT_BUFFER, MESSAGE_TYPE.PRINT_FILE]

      let isValid = false
      for (let i = 0; i < validTypes.length; i++) {
        const vType = validTypes[i]
        isValid = msg.t === vType
        if (isValid) { break }
      }

      if (!isValid) { throw new Error('msg is not a valid PrintMessage (wrong type): ' + msg) }
    }

    super(msg)
  }

  get data () {
    return this._m.d
  }

  set data (data) {
    this._m.d = data
  }
}

class PrintTextMessage extends PrintMessage {
  constructor (msg = undefined) {
    if (msg && msg.t !== MESSAGE_TYPE.PRINT_TEXT) {
      throw new Error('msg is not type PRINT_TEXT: ' + msg)
    }
    super(msg)
  }
}

class PrintBufferMessage extends PrintMessage {
  constructor (msg = undefined) {
    if (msg && msg.t !== MESSAGE_TYPE.PRINT_BUFFER) {
      throw new Error('msg is not type PRINT_BUFFER: ' + msg)
    }
    super(msg)
  }
}

class PrintFileMessage extends PrintMessage {
  constructor (msg = undefined) {
    if (msg && msg.t !== MESSAGE_TYPE.PRINT_FILE) {
      throw new Error('msg is not type PRINT_FILE: ' + msg)
    }
    super(msg)
  }
}

class AckMessage extends Message {

  constructor (msg = undefined) {
    super()
  }
}
