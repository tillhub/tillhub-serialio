/// <reference types="node" />
import SerialPort from 'serialport';
import Message from './components/message';
import { MessageHandler, PortEventHandler } from './components/types';
/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
export declare class SerialIO {
    /**
     * Returns a list of usable serial ports
     * @returns {Promise<SerialPort.PortInfo[]>}
     */
    static list(): Promise<SerialPort.PortInfo[]>;
    /**
     * Indicates if a message transaction is in progress
     * @type {boolean}
     */
    sending: boolean;
    /**
     * indicates if closing event is intended behaviour
     * @type {boolean}
     */
    closing: boolean;
    reopenAttempts: number;
    readonly port: string;
    private _queue;
    private readonly _d;
    private _handlers;
    private readonly _serialPort;
    private _parser;
    private _transactions;
    /**
     * Creates a new SerialIO instance bound to the specified serial port.
     * @param {string} port - target serial port, e.g. '/dev/tty1'
     */
    constructor(port: string);
    /**
     * Tries to open the serial port.
     * @returns {Promise<void>}
     */
    open(): Promise<{}>;
    /**
     * Closes an opened serial port
     * @returns {Promise<void>}
     */
    close(): Promise<{}>;
    /**
     * Indicates whether the serial port is open or not.
     * @returns {boolean}
     */
    isOpen(): boolean;
    /**
     * Sets the handler to be called when a new message has been received
     * @param {MessageHandler} handler
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Sets a handler to be called on 'error' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onError(handler: PortEventHandler): void;
    /**
     * Sets a handler to be called on 'drain' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onDrain(handler: PortEventHandler): void;
    /**
     * Sets a handler to be called on 'close' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onClose(handler: PortEventHandler): void;
    /**
     * Sets a handler to be called on 'open' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onOpen(handler: PortEventHandler): void;
    /**
     * Send a request with a message body
     */
    sendRequest(data: string | object): Promise<Message | undefined>;
    /**
     * Send a ping request
     * @returns {Promise<Message | undefined>}
     */
    ping(): Promise<Message | undefined>;
    /**
     * Send a (success) reply
     */
    sendReply(data: string, id: number): Promise<Message | undefined>;
    /**
     * Send an error reply
     */
    sendErrorReply(error: Error, id: number): Promise<Message | undefined>;
    /**
     * Handles incoming messages from parser event 'data'.
     * Parses them and calls callbacks subscribed to corresponding message type.
     * @param {Message} msg - raw message string
     * @private
     */
    _handleMessage(msg: Message): Promise<void>;
    /**
     * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
     * @param {Error} err - close event error message
     * @private
     */
    _closeHandler(err: Error): void;
    /**
     * Sends a buffer by writing smaller chunks of it into the serial port,
     * to workaround a bug of losing data when sending large payloads.
     * @param {Buffer} buffer
     * @param {number} from
     * @private
     */
    _sendInParts(buffer: Buffer, from?: number): Promise<void>;
    /**
     * Writes data to the serial port and then drains it.
     * @param {Buffer} data
     * @returns {Promise<void>}
     * @private
     */
    _writeAndDrain(data: Buffer): Promise<void>;
    /**
     * Send a message over the serial port
     * @param {Message} msg
     * @param {number} timeout
     * @returns {Promise<Message | undefined>} - fulfills with a reply, or undefined if the initial message was a reply
     */
    send(msg: Message, timeout?: number): Promise<Message | undefined>;
}
export default SerialIO;
