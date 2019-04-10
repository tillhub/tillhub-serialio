"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
var TYPE;
(function (TYPE) {
    TYPE[TYPE["REQUEST"] = 0] = "REQUEST";
    TYPE[TYPE["PING"] = 1] = "PING";
    TYPE[TYPE["REPLY"] = 254] = "REPLY";
    TYPE[TYPE["ERROR"] = 255] = "ERROR";
})(TYPE || (TYPE = {}));
var META_OFFSET;
(function (META_OFFSET) {
    META_OFFSET[META_OFFSET["START"] = 0] = "START";
    META_OFFSET[META_OFFSET["LENGTH"] = 4] = "LENGTH";
    META_OFFSET[META_OFFSET["ID"] = 8] = "ID";
    META_OFFSET[META_OFFSET["TYPE"] = 10] = "TYPE";
    META_OFFSET[META_OFFSET["DATA"] = 11] = "DATA";
})(META_OFFSET || (META_OFFSET = {}));
const startSequence = Buffer.allocUnsafe(4);
startSequence.writeUInt32BE(0xf000000f, 0);
class Message {
    /**
     * Takes a buffer containing the raw message (i.e. start sequence starts at index 0)
     * @param {Buffer} buf
     */
    constructor(buf) {
        // each message gets a unique id, for easier debugging
        this.raw = buf;
        this._d = Message.debug.extend(`${this.id}`);
        // this._d('Creating message from buffer', buf)
        this._d('New message created. l: %d, id: %d, type: %d', this.length, this.id, this.type, buf);
    }
    /**
     * Returns the start sequence
     * @returns {number}
     */
    get start() {
        return this.raw.readUInt32BE(Message.META_OFFSET.START);
    }
    /**
     * Returns the message (payload) length (not to be confused with the raw message buffer size)
     * @returns {number}
     */
    get length() {
        return this.raw.readUInt32BE(Message.META_OFFSET.LENGTH);
    }
    /**
     * Returns the id of the message
     * @returns {number}
     */
    get id() {
        return this.raw.readUInt16BE(Message.META_OFFSET.ID);
    }
    /**
     * Returns the message type
     * @returns {number}
     */
    get type() {
        return this.raw.readUInt8(Message.META_OFFSET.TYPE);
    }
    /**
     * Returns the raw message payload
     * @returns {Buffer}
     */
    get rawData() {
        return this.raw.slice(Message.META_OFFSET.DATA);
    }
    /**
     * Returns the message payload
     * @returns {string}
     */
    get data() {
        return this.rawData.toString();
    }
    static create(data, type, id = Message.nextId()) {
        const dataBuffer = data instanceof Buffer
            ? data
            : Buffer.from(data);
        // alloc with enough extra bytes for meta info
        const outBuff = Buffer.allocUnsafe(dataBuffer.length + Message.META_OFFSET.DATA);
        Message.START_SEQUENCE.copy(outBuff, Message.META_OFFSET.START); // start sequence
        outBuff.writeUInt32BE(dataBuffer.length, Message.META_OFFSET.LENGTH); // message length
        outBuff.writeUInt16BE(id, Message.META_OFFSET.ID); // message length
        outBuff.writeUInt8(type, Message.META_OFFSET.TYPE); // message type
        dataBuffer.copy(outBuff, Message.META_OFFSET.DATA); // message data
        return new Message(outBuff);
    }
    /**
     * Returns the next unique id (max 4 bytes; restarts from 0 if over max)
     * @returns {number}
     */
    static nextId() {
        const id = Message._id;
        // make sure each id is unique (at least long enough for the instance lifetime)
        Message._id = (Message._id + 1) % 0x10000;
        Message.debug('nextId', id);
        return id;
    }
}
Message.META_OFFSET = META_OFFSET;
Message.TYPE = TYPE;
Message.START_SEQUENCE = startSequence;
Message.debug = debug_1.default(`serialio:Message`);
Message._id = 0;
exports.default = Message;
//# sourceMappingURL=message.js.map