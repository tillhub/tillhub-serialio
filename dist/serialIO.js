"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
const promise_queue_1 = __importDefault(require("promise-queue"));
const serialport_1 = __importDefault(require("serialport"));
const dataParser_1 = __importDefault(require("./components/dataParser"));
const message_1 = __importDefault(require("./components/message"));
const transactionHolder_1 = __importDefault(require("./components/transactionHolder"));
const utils_1 = __importDefault(require("./components/utils"));
/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
class SerialIO {
    /**
     * Creates a new SerialIO instance bound to the specified serial port.
     * @param {string} port - target serial port, e.g. '/dev/tty1'
     */
    constructor(port) {
        /**
         * Indicates if a message transaction is in progress
         * @type {boolean}
         */
        this.sending = false;
        /**
         * indicates if closing event is intended behaviour
         * @type {boolean}
         */
        this.closing = false;
        this.reopenAttempts = 0;
        this._queue = new promise_queue_1.default(1, Infinity);
        this._handlers = {};
        this._parser = new dataParser_1.default();
        this._transactions = new transactionHolder_1.default();
        this._d = debug_1.default(`serialio:serialio:${port}`);
        this._d('initializing...');
        this.port = port;
        this._parser.onMessage((msg) => this._handleMessage(msg));
        this._serialPort = new serialport_1.default(port, { autoOpen: false });
        this._serialPort.on('data', (data) => {
            this._d('DATA', data);
            try {
                this._parser && this._parser.parseData(data);
            }
            catch (e) {
                this._d('parsing data failed: %s', e.message || e);
            }
        });
        this._serialPort.on('error', (err) => {
            this._d('error event: %s', err);
            try {
                this._handlers.error && this._handlers.error(err);
            }
            catch (e) {
                this._d('error handler returned with error: %s', e.message || e);
            }
        });
        this._serialPort.on('drain', (err) => {
            this._d('drain event: %s', err);
            try {
                this._handlers.drain && this._handlers.drain(err);
            }
            catch (e) {
                this._d('drain handler returned with error: %s', e.message || e);
            }
        });
        this._serialPort.on('open', (err) => {
            this._d('open event: %s', err);
            try {
                this._handlers.open && this._handlers.open(err);
            }
            catch (e) {
                this._d('open handler returned with error: %s', e.message || e);
            }
        });
        this._serialPort.on('close', (err) => {
            this._d('close event: %s', err);
            // provide handler with additional 'unexpected' flag
            try {
                this._handlers.close && this._handlers.close(err);
            }
            catch (e) {
                this._d('close handler returned with error: %s', e.message || e);
            }
            try {
                this._closeHandler(new Error(err));
            }
            catch (e) {
                this._d('internal close handler failed', e);
            }
        });
    }
    /**
     * Returns a list of usable serial ports
     * @returns {Promise<SerialPort.PortInfo[]>}
     */
    static list() {
        return serialport_1.default.list();
    }
    /**
     * Tries to open the serial port.
     * @returns {Promise<void>}
     */
    open() {
        this.closing = false;
        return new Promise((resolve, reject) => {
            this._serialPort.open((e) => {
                if (e) {
                    this._d('opening port failed', e);
                    reject(e);
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Closes an opened serial port
     * @returns {Promise<void>}
     */
    close() {
        this.closing = true;
        return new Promise((resolve, reject) => {
            this._serialPort.close((e) => {
                if (e) {
                    this._d('closing port failed', e);
                    reject(e);
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Indicates whether the serial port is open or not.
     * @returns {boolean}
     */
    isOpen() {
        return this._serialPort.isOpen;
    }
    /**
     * Sets the handler to be called when a new message has been received
     * @param {MessageHandler} handler
     */
    onMessage(handler) {
        this._d('setting onMessage handler');
        this._handlers.message = handler;
    }
    /**
     * Sets a handler to be called on 'error' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onError(handler) {
        this._handlers.error = handler;
    }
    /**
     * Sets a handler to be called on 'drain' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onDrain(handler) {
        this._handlers.drain = handler;
    }
    /**
     * Sets a handler to be called on 'close' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onClose(handler) {
        this._handlers.close = handler;
    }
    /**
     * Sets a handler to be called on 'open' events of the underlying serial port
     * @param {PortEventHandler} handler
     */
    onOpen(handler) {
        this._handlers.open = handler;
    }
    /**
     * Send a request with a message body
     */
    sendRequest(data) {
        if (typeof data !== 'string')
            data = JSON.stringify(data);
        return this.send(message_1.default.create(data, message_1.default.TYPE.REQUEST));
    }
    /**
     * Send a ping request
     * @returns {Promise<Message | undefined>}
     */
    ping() {
        return this.send(message_1.default.create('', message_1.default.TYPE.PING), 500);
    }
    /**
     * Send a (success) reply
     */
    sendReply(data, id) {
        return this.send(message_1.default.create(data, message_1.default.TYPE.REPLY, id));
    }
    /**
     * Send an error reply
     */
    sendErrorReply(error, id) {
        return this.send(message_1.default.create(error.message, message_1.default.TYPE.ERROR, id));
    }
    /**
     * Handles incoming messages from parser event 'data'.
     * Parses them and calls callbacks subscribed to corresponding message type.
     * @param {Message} msg - raw message string
     * @private
     */
    _handleMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this._d(`${this.port} > [${utils_1.default.toHex(msg.type)}:${msg.rawData.length}b] ${utils_1.default.truncate(msg.data)}`);
            switch (msg.type) {
                case message_1.default.TYPE.PING:
                    try {
                        yield this.sendReply('', msg.id);
                    }
                    catch (e) {
                        this._d('failed to pong', e);
                    }
                    break;
                case message_1.default.TYPE.REQUEST:
                    this._d('handlers:', this._handlers);
                    if (!this._handlers.message) {
                        this._d('no message handler specified');
                        return;
                    }
                    try {
                        const result = yield this._handlers.message(msg);
                        this._d('got message handler result', result);
                        try {
                            yield this.sendReply(result || '', msg.id);
                        }
                        catch (e) {
                            this._d('failed to send reply', e);
                        }
                    }
                    catch (e) {
                        this._d('message handler threw error. sending error reply', e);
                        try {
                            yield this.sendErrorReply(e, msg.id);
                        }
                        catch (e) {
                            this._d('failed to send error reply', e);
                        }
                    }
                    break;
                case message_1.default.TYPE.REPLY:
                    this._transactions.resolve(msg.id, msg);
                    break;
                case message_1.default.TYPE.ERROR:
                    this._transactions.reject(msg.id, new Error(msg.data));
                    break;
                default:
                    this._d('Unknown message type detected: %d', msg.type);
                    break;
            }
        });
    }
    /**
     * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
     * @param {Error} err - close event error message
     * @private
     */
    _closeHandler(err) {
        if (this.closing) {
            this._d('expected closing of port');
            return;
        }
        this._d('unexpected closing of port: %s', err.message || err);
        this.reopenAttempts = 0;
        const connect = () => {
            this._d('attempting to reopen port in 1s');
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                this._d(`reopen attempt #${this.reopenAttempts++}`);
                try {
                    yield this.open();
                    this._d(`reopen attempt successful`);
                }
                catch (e) {
                    this._d('reopen attempt failed: %s', e.message || e);
                    connect();
                }
            }), 1000);
        };
        connect();
    }
    /**
     * Sends a buffer by writing smaller chunks of it into the serial port,
     * to workaround a bug of losing data when sending large payloads.
     * @param {Buffer} buffer
     * @param {number} from
     * @private
     */
    _sendInParts(buffer, from = 0) {
        return __awaiter(this, void 0, void 0, function* () {
            this._d('sendInParts. buffer: %dB, from: %d, remaining: %dB', buffer.length, from, buffer.length - from);
            const partSize = Math.min(512, buffer.length - from);
            // we want this to throw, it's then handled by calling function
            yield this._writeAndDrain(buffer.slice(from, from + partSize));
            if (buffer.length > from + partSize) {
                return this._sendInParts(buffer, from + partSize);
            }
            else {
                this._d('sendInParts DONE');
                this.sending = false;
            }
        });
    }
    /**
     * Writes data to the serial port and then drains it.
     * @param {Buffer} data
     * @returns {Promise<void>}
     * @private
     */
    _writeAndDrain(data) {
        this._d('writeAndDrain', data.length);
        return new Promise((resolve, reject) => {
            // write...
            this._serialPort.write(data, undefined, (wErr) => {
                // we still want to drain, so don't resolve yet
                // don't know if we need both checks, but I probably put it in for a reason
                if (wErr) {
                    this._d('write failed: %s', wErr.message || wErr);
                    return reject(wErr);
                }
                // and drain...
                this._serialPort.drain((dErr) => {
                    if (dErr) {
                        this._d('drain failed: %s', dErr.message || dErr);
                        return reject(dErr);
                    }
                    return resolve();
                });
            });
        });
    }
    /**
     * Send a message over the serial port
     * @param {Message} msg
     * @param {number} timeout
     * @returns {Promise<Message | undefined>} - fulfills with a reply, or undefined if the initial message was a reply
     */
    send(msg, timeout) {
        return new Promise((resolve, reject) => {
            this._transactions.add({ id: msg.id, resolve, reject }, timeout);
            this._queue.add(() => {
                this._d(`${this.port} < [${utils_1.default.toHex(msg.type)}:${msg.rawData.length}b] ${utils_1.default.truncate(msg.data)}`);
                return this._sendInParts(msg.raw);
            }).then(() => {
                if (msg.type === message_1.default.TYPE.REPLY) {
                    this._transactions.resolve(msg.id);
                }
            }, (e) => {
                this._d('failed to send message', e);
                this._transactions.reject(msg.id, e);
            });
        });
    }
}
exports.SerialIO = SerialIO;
// NOTE no idea why default export has to be done like this,
// but to `export default` the class directly leads to problems when it's used as a dependency
exports.default = SerialIO;
//# sourceMappingURL=serialIO.js.map