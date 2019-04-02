import debug from 'debug'

enum TYPE {
  ERROR = 0xff,
  REPLY = 0xfe,
  REQUEST = 0x00
}

enum META_OFFSET {
  START = 0,
  LENGTH = 4,
  ID = 8,
  TYPE = 10,
  DATA = 11
}

const startSequence = Buffer.allocUnsafe(4)
startSequence.writeUInt32BE(0xf000000f, 0)

export default class Message {

  /**
   * Returns the start sequence
   * @returns {number}
   */
  get start () {
    return this.raw.readUInt32BE(Message.META_OFFSET.START)
  }

  /**
   * Returns the message (payload) length (not to be confused with the raw message buffer size)
   * @returns {number}
   */
  get length () {
    return this.raw.readUInt32BE(Message.META_OFFSET.LENGTH)
  }

  /**
   * Returns the id of the message
   * @returns {number}
   */
  get id () {
    return this.raw.readUInt16BE(Message.META_OFFSET.ID)
  }

  /**
   * Returns the message type
   * @returns {number}
   */
  get type () {
    return this.raw.readUInt8(Message.META_OFFSET.TYPE)
  }

  /**
   * Returns the raw message payload
   * @returns {Buffer}
   */
  get rawData () {
    return this.raw.slice(Message.META_OFFSET.DATA)
  }

  /**
   * Returns the message payload
   * @returns {string}
   */
  get data () {
    return this.rawData.toString()
  }

  public static readonly META_OFFSET = META_OFFSET
  public static readonly TYPE = TYPE
  public static readonly START_SEQUENCE = startSequence

  public static create (data: Buffer | string, type: TYPE, id = Message.nextId()): Message {
    const dataBuffer = data instanceof Buffer
      ? data
      : Buffer.from(data)
    // alloc with enough extra bytes for meta info
    const outBuff = Buffer.allocUnsafe(dataBuffer.length + Message.META_OFFSET.DATA)

    Message.START_SEQUENCE.copy(outBuff, Message.META_OFFSET.START) // start sequence
    outBuff.writeUInt32BE(dataBuffer.length, Message.META_OFFSET.LENGTH) // message length
    outBuff.writeUInt16BE(id, Message.META_OFFSET.ID) // message length
    outBuff.writeUInt8(type, Message.META_OFFSET.TYPE) // message type
    dataBuffer.copy(outBuff, Message.META_OFFSET.DATA) // message data
    return new Message(outBuff)
  }

  protected static readonly debug = debug(`serialio:Message`)

  /**
   * Returns the next unique id (max 4 bytes; restarts from 0 if over max)
   * @returns {number}
   */
  protected static nextId (): number {
    const id = Message._id
    // make sure each id is unique (at least long enough for the instance lifetime)
    Message._id = (Message._id + 1) % 0x10000
    Message.debug('nextId', id)
    return id
  }

  private static _id = 0

  public readonly raw: Buffer
  private readonly _d: debug.Debugger

  /**
   * Takes a buffer containing the raw message (i.e. start sequence starts at index 0)
   * @param {Buffer} buf
   */
  constructor (buf: Buffer) {
    // each message gets a unique id, for easier debugging
    this.raw = buf
    this._d = Message.debug.extend(`${this.id}`)
    // this._d('Creating message from buffer', buf)
    this._d('New message created. l: %d, id: %d, type: %d', this.length, this.id, this.type, buf)
  }
}
