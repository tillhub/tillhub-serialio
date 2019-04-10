/// <reference types="node" />
import debug from 'debug';
declare enum TYPE {
    REQUEST = 0,
    PING = 1,
    REPLY = 254,
    ERROR = 255
}
declare enum META_OFFSET {
    START = 0,
    LENGTH = 4,
    ID = 8,
    TYPE = 10,
    DATA = 11
}
export default class Message {
    /**
     * Returns the start sequence
     * @returns {number}
     */
    readonly start: number;
    /**
     * Returns the message (payload) length (not to be confused with the raw message buffer size)
     * @returns {number}
     */
    readonly length: number;
    /**
     * Returns the id of the message
     * @returns {number}
     */
    readonly id: number;
    /**
     * Returns the message type
     * @returns {number}
     */
    readonly type: number;
    /**
     * Returns the raw message payload
     * @returns {Buffer}
     */
    readonly rawData: Buffer;
    /**
     * Returns the message payload
     * @returns {string}
     */
    readonly data: string;
    static readonly META_OFFSET: typeof META_OFFSET;
    static readonly TYPE: typeof TYPE;
    static readonly START_SEQUENCE: Buffer;
    static create(data: Buffer | string, type: TYPE, id?: number): Message;
    protected static readonly debug: debug.Debugger;
    /**
     * Returns the next unique id (max 4 bytes; restarts from 0 if over max)
     * @returns {number}
     */
    protected static nextId(): number;
    private static _id;
    readonly raw: Buffer;
    private readonly _d;
    /**
     * Takes a buffer containing the raw message (i.e. start sequence starts at index 0)
     * @param {Buffer} buf
     */
    constructor(buf: Buffer);
}
export {};
