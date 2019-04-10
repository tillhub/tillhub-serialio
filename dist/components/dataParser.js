"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
const message_1 = __importDefault(require("./message"));
/**
 * The DataParser can parse data streams in form of buffers, and extract SerialIO messages out of them.
 */
class DataParser {
    constructor() {
        this._pendingMessage = false;
        this._d = DataParser.debug.extend(`${DataParser.nextId()}`);
    }
    /**
     * Returns the next unique id (max 4 bytes; restarts from 0 if over max)
     * @returns {number}
     */
    static nextId() {
        const id = DataParser._id;
        // make sure each id is unique (at least long enough for the instance lifetime)
        DataParser._id = (DataParser._id + 1) % 0x100;
        return id;
    }
    /**
     * Sets the handler to be called when a new message has been parsed
     * @param {ParsedMessageHandler} handler
     */
    onMessage(handler) {
        this._onMessageHandler = handler;
    }
    /**
     * Calls the onMessage handler with the specified message. Does not throw an error.
     * @param {Message} msg
     * @returns {Promise<void>}
     * @private
     */
    _callOnMessageHandler(msg) {
        if (!this._onMessageHandler) {
            this._d('no message handler defined');
            return;
        }
        try {
            this._onMessageHandler(msg);
        }
        catch (e) {
            this._d('calling onMessage handler failed: %s', e.message || e);
        }
    }
    /**
     * Takes incoming data from the serial port and parses it until all data is consumed.
     * @param {Buffer} data - incoming data from the serial port
     */
    parseData(data) {
        // append new data to existing buffer
        this._buffer = this._buffer ? Buffer.concat([this._buffer, data]) : data;
        this._d('parsing data: %dB, buffer: %dB', data.length, this._buffer.length, this._buffer);
        // only parse if we have at least meta info bytes of possible message to work with
        while (this._buffer.length >= message_1.default.META_OFFSET.DATA) {
            this._d('looping. remaining bytes: %dB', this._buffer.length);
            if (!this._pendingMessage) {
                const newMsgIndex = this._buffer.indexOf(message_1.default.START_SEQUENCE);
                if (newMsgIndex === -1) {
                    this._d('found no message, dropping data');
                    // nothing found, drop data
                    // worst case, all but 1b of start sequence are in buffer already
                    // that's why we keep the last <start_seq> - 1 bytes
                    this._buffer = this._buffer.slice(1 - message_1.default.START_SEQUENCE.length);
                    break;
                }
                this._d('found message at index %d', newMsgIndex);
                this._buffer = this._buffer.slice(newMsgIndex);
                this._pendingMessage = true;
                continue; // adapted buffer, so rerun loop
            }
            // extract length
            const mLength = this._buffer.readUInt32BE(message_1.default.META_OFFSET.LENGTH);
            const _rawSize = mLength + message_1.default.META_OFFSET.DATA;
            this._d('message payload length: %dB -> raw size: %dB', mLength, _rawSize);
            // we check if there is a message start in the expected message payload
            const nextMsgIndex = this._buffer.indexOf(message_1.default.START_SEQUENCE, 4);
            if (nextMsgIndex > -1 && nextMsgIndex < _rawSize) {
                // new message received before old one completed
                // reset buffer and try again
                this._d('pending message cannot be completed and will be dropped. received: %dB, missing: %dB', nextMsgIndex, _rawSize - nextMsgIndex);
                this._buffer = this._buffer.slice(nextMsgIndex);
                continue;
            }
            if (this._buffer.length < _rawSize) {
                this._d('message is incomplete. waiting for more data');
                break;
            }
            this._d('message is complete');
            const msg = new message_1.default(this._buffer.slice(0, _rawSize));
            this._callOnMessageHandler(msg);
            this._buffer = this._buffer.slice(_rawSize);
            this._pendingMessage = false;
        }
        this._d('loop done with remaining %dB buffer:', this._buffer.length, this._buffer);
    }
}
DataParser.debug = debug_1.default(`serialio:DataParser`);
DataParser._id = 0;
exports.default = DataParser;
module.exports = DataParser;
//# sourceMappingURL=dataParser.js.map