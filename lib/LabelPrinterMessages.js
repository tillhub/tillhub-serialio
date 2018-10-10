let _id = 0;

class Message {

  _m = {
    t: Message.TYPE.UNKNOWN,
    i: undefined,
  }

  constructor (msg = undefined) {
    // TODO: probably needs some kind of validation

    if (msg) { this._m = msg }
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
      'TYPE': 't',
      'DATA': 'd'
    })
  }

  /**
   *
   * @param {object} rawMsg
   */
  static fromMessage(rawMsg) {
    const type = rawMsg.t;

    switch (type) {
      case this.TYPE.PRINT_TEXT:
        return new PrintTextMessage(rawMsg);
    }
  }

  get type () {
    return this._m.t
  }

  set type (type) {
    this._m.t = type
  }

  get id () {
    return this._m.i;
  }

  set id (id) {
    this._m.i = id;
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
    super(msg)

    const validTypes = [Message.TYPE.PRINT_TEXT, Message.TYPE.PRINT_BUFFER, Message.TYPE.PRINT_FILE]

    let isValid = false
    for (let i = 0; i < validTypes.length; i++) {
      const vType = validTypes[i]
      isValid = msg.t === vType
      if (isValid) { break }
    }

    if (!isValid) { throw new Error('msg is not a valid PrintMessage (wrong type): ' + msg) }
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
    if (msg && msg.t !== Message.TYPE.PRINT_TEXT) {
      throw new Error('msg is not type PRINT_TEXT: ' + msg)
    }
    super(msg)
  }
}

class PrintBufferMessage extends PrintMessage {
  constructor (msg = undefined) {
    if (msg && msg.t !== Message.TYPE.PRINT_BUFFER) {
      throw new Error('msg is not type PRINT_BUFFER: ' + msg)
    }
    super(msg)
  }
}

class PrintFileMessage extends PrintMessage {
  constructor (msg = undefined) {
    if (msg && msg.t !== Message.TYPE.PRINT_FILE) {
      throw new Error('msg is not type PRINT_FILE: ' + msg)
    }
    super(msg)
  }
}

module.exports = { Message, PrintMessage, PrintTextMessage, PrintBufferMessage, PrintFileMessage }
