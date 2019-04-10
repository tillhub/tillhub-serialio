/// <reference types="node" />
import debug from 'debug';
import Message from './message';
import { ParsedMessageHandler } from './types';
/**
 * The DataParser can parse data streams in form of buffers, and extract SerialIO messages out of them.
 */
export default class DataParser {
    protected static readonly debug: debug.Debugger;
    /**
     * Returns the next unique id (max 4 bytes; restarts from 0 if over max)
     * @returns {number}
     */
    protected static nextId(): number;
    private static _id;
    private readonly _d;
    private _buffer?;
    private _onMessageHandler?;
    private _pendingMessage;
    constructor();
    /**
     * Sets the handler to be called when a new message has been parsed
     * @param {ParsedMessageHandler} handler
     */
    onMessage(handler: ParsedMessageHandler): void;
    /**
     * Calls the onMessage handler with the specified message. Does not throw an error.
     * @param {Message} msg
     * @returns {Promise<void>}
     * @private
     */
    _callOnMessageHandler(msg: Message): void;
    /**
     * Takes incoming data from the serial port and parses it until all data is consumed.
     * @param {Buffer} data - incoming data from the serial port
     */
    parseData(data: Buffer): void;
}
