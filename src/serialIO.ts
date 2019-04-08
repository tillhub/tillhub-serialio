import debug from 'debug'
import Queue from 'promise-queue'
import SerialPort from 'serialport'
import DataParser from './components/dataParser'
import { HandlerHolder } from './components/handlerHolder'
import Message from './components/message'
import TransactionHolder from './components/transactionHolder'
import { MessageHandler, PortEventHandler, Transaction } from './components/types'
import Utils from './components/utils'

/**
 * Messaging API, allows to send & receive message over a serial serialIO in a simple manner.
 */
export class SerialIO {

  /**
   * Returns a list of usable serial ports
   * @returns {Promise<SerialPort.PortInfo[]>}
   */
  public static list () {
    return SerialPort.list()
  }

  /**
   * Indicates if a message transaction is in progress
   * @type {boolean}
   */
  public sending: boolean = false

  /**
   * indicates if closing event is intended behaviour
   * @type {boolean}
   */
  public closing = false
  public reopenAttempts: number = 0
  public readonly port: string

  private _queue = new Queue(1, Infinity)
  private readonly _d: debug.Debugger
  private _handlers = {} as HandlerHolder
  private readonly _serialPort: SerialPort
  private _parser = new DataParser()
  private _transactions = new TransactionHolder()

  /**
   * Creates a new SerialIO instance bound to the specified serial port.
   * @param {string} port - target serial port, e.g. '/dev/tty1'
   */
  constructor (port: string) {
    this._d = debug(`serialio:serialio:${port}`)

    this._d('initializing...')

    this.port = port
    this._parser.onMessage((msg) => this._handleMessage(msg))
    this._serialPort = new SerialPort(port, { autoOpen: false })
    this._serialPort.on('data', (data) => {
      this._d('DATA', data)
      try {
        this._parser && this._parser.parseData(data)
      } catch (e) {
        this._d('parsing data failed: %s', e.message || e)
      }
    })
    this._serialPort.on('error', (err) => {
      this._d('error event: %s', err)
      try {
        this._handlers.error && this._handlers.error(err)
      } catch (e) {
        this._d('error handler returned with error: %s', e.message || e)
      }
    })
    this._serialPort.on('drain', (err) => {
      this._d('drain event: %s', err)
      try {
        this._handlers.drain && this._handlers.drain(err)
      } catch (e) {
        this._d('drain handler returned with error: %s', e.message || e)
      }
    })
    this._serialPort.on('open', (err) => {
      this._d('open event: %s', err)
      try {
        this._handlers.open && this._handlers.open(err)
      } catch (e) {
        this._d('open handler returned with error: %s', e.message || e)
      }
    })
    this._serialPort.on('close', (err) => {
      this._d('close event: %s', err)
      // provide handler with additional 'unexpected' flag
      try {
        this._handlers.close && this._handlers.close(err)
      } catch (e) {
        this._d('close handler returned with error: %s', e.message || e)
      }
      try {
        this._closeHandler(new Error(err))
      } catch (e) {
        this._d('internal close handler failed', e)
      }
    })
  }

  /**
   * Tries to open the serial port.
   * @returns {Promise<void>}
   */
  public open () {
    this.closing = false
    return new Promise((resolve, reject) => {
      this._serialPort.open((e) => {
        if (e) {
          this._d('opening port failed', e)
          reject(e)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Closes an opened serial port
   * @returns {Promise<void>}
   */
  public close () {
    this.closing = true
    return new Promise((resolve, reject) => {
      this._serialPort.close((e) => {
        if (e) {
          this._d('closing port failed', e)
          reject(e)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Indicates whether the serial port is open or not.
   * @returns {boolean}
   */
  public isOpen () {
    return this._serialPort.isOpen
  }

  /**
   * Sets the handler to be called when a new message has been received
   * @param {MessageHandler} handler
   */
  public onMessage (handler: MessageHandler) {
    this._d('setting onMessage handler')
    this._handlers.message = handler
  }

  /**
   * Sets a handler to be called on 'error' events of the underlying serial port
   * @param {PortEventHandler} handler
   */
  public onError (handler: PortEventHandler) {
    this._handlers.error = handler
  }

  /**
   * Sets a handler to be called on 'drain' events of the underlying serial port
   * @param {PortEventHandler} handler
   */
  public onDrain (handler: PortEventHandler) {
    this._handlers.drain = handler
  }

  /**
   * Sets a handler to be called on 'close' events of the underlying serial port
   * @param {PortEventHandler} handler
   */
  public onClose (handler: PortEventHandler) {
    this._handlers.close = handler
  }

  /**
   * Sets a handler to be called on 'open' events of the underlying serial port
   * @param {PortEventHandler} handler
   */
  public onOpen (handler: PortEventHandler) {
    this._handlers.open = handler
  }

  /**
   * Send a request with a message body
   */
  public sendRequest (data: string | object) {
    if (typeof data !== 'string') data = JSON.stringify(data)

    return this.send(Message.create(data, Message.TYPE.REQUEST))
  }

  /**
   * Send a (success) reply
   */
  public sendReply (data: string, id: number) {
    return this.send(Message.create(data, Message.TYPE.REPLY, id))
  }

  /**
   * Send an error reply
   */
  public sendErrorReply (error: Error, id: number) {
    return this.send(Message.create(error.message, Message.TYPE.ERROR, id))
  }

  /**
   * Handles incoming messages from parser event 'data'.
   * Parses them and calls callbacks subscribed to corresponding message type.
   * @param {Message} msg - raw message string
   * @private
   */
  public async _handleMessage (msg: Message) {
    this._d(`${this.port} > [${Utils.toHex(msg.type)}:${msg.rawData.length}b] ${Utils.truncate(msg.data)}`)
    switch (msg.type) {
      case Message.TYPE.REQUEST:
        this._d('handlers:', this._handlers)
        if (!this._handlers.message) {
          this._d('no message handler specified')
          return
        }
        try {
          const result = await this._handlers.message(msg)
          this._d('got message handler result', result)
          try {
            await this.sendReply(result || '', msg.id)
          } catch (e) {
            this._d('failed to send reply', e)
          }
        } catch (e) {
          this._d('message handler threw error. sending error reply', e)
          try {
            await this.sendErrorReply(e, msg.id)
          } catch (e) {
            this._d('failed to send error reply', e)
          }
        }
        break
      case Message.TYPE.REPLY:
        this._transactions.resolve(msg.id, msg)
        break
      case Message.TYPE.ERROR:
        this._transactions.reject(msg.id, new Error(msg.data))
        break
      default:
        this._d('Unknown message type detected: %d', msg.type)
        break
    }
  }

  /**
   * Handles 'close' events of serial ports and if they happen unexpectedly, tries to reopen the port.
   * @param {Error} err - close event error message
   * @private
   */
  public _closeHandler (err: Error) {
    if (this.closing) {
      this._d('expected closing of port')
      return
    }

    this._d('unexpected closing of port: %s', err.message || err)
    this.reopenAttempts = 0
    const connect = () => {
      this._d('attempting to reopen port in 1s')
      setTimeout(async () => {
        this._d(`reopen attempt #${this.reopenAttempts++}`)
        try {
          await this.open()
          this._d(`reopen attempt successful`)
        } catch (e) {
          this._d('reopen attempt failed: %s', e.message || e)
          connect()
        }
      }, 1000)
    }
    connect()
  }

  /**
   * Sends a buffer by writing smaller chunks of it into the serial port,
   * to workaround a bug of losing data when sending large payloads.
   * @param {Buffer} buffer
   * @param {number} from
   * @private
   */
  public async _sendInParts (buffer: Buffer, from = 0) {
    this._d('sendInParts', buffer.length, from, buffer.length - from)
    const partSize = Math.min(1024 * 64, buffer.length)
    const partBuf = Buffer.allocUnsafe(Math.min(partSize, buffer.length - from))
    buffer.copy(partBuf, 0, from, from + partBuf.length)

    // we want this to throw, it's then handled by calling function
    await this._writeAndDrain(partBuf)
    if (buffer.length !== from + partBuf.length) {
      await this._sendInParts(buffer, from + partSize)
    } else {
      this._d('sendInParts DONE')
      this.sending = false
    }
  }

  /**
   * Writes data to the serial port and then drains it.
   * @param {Buffer} data
   * @returns {Promise<void>}
   * @private
   */
  public _writeAndDrain (data: Buffer) {
    this._d('writeAndDrain', data.length)
    return new Promise<void>((resolve, reject) => {
      // write...
      this._serialPort.write(data, undefined, (err) => {
        // we still want to drain, so don't resolve yet
        // don't know if we need both checks, but I probably put it in for a reason
        if (err) {
          this._d('write failed: %s', err.message || err)
          reject(err)
        }
      })

      // and drain...
      this._serialPort.drain((err) => {
        if (err) {
          this._d('drain failed: %s', err.message || err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Send a message over the serial port
   * @param {Message} msg
   * @returns {Promise<Message | undefined>} - fulfills with a reply, or undefined if the initial message was a reply
   */
  public send (msg: Message) {
    return new Promise<Message | undefined>((resolve, reject) => {
      this._transactions.add({ id: msg.id, resolve, reject } as Transaction)
      this._queue.add(() => {
        this._d(`${this.port} < [${Utils.toHex(msg.type)}:${msg.rawData.length}b] ${Utils.truncate(msg.data)}`)
        return this._sendInParts(msg.raw)
      }).then(
        () => {
          if (msg.type === Message.TYPE.REPLY) {
            this._transactions.resolve(msg.id, msg)
          }
        },
        (e) => {
          this._d('failed to send message', e)
          this._transactions.reject(msg.id, e)
        }
      )
    })
  }
}

// NOTE no idea why default export has to be done like this,
// but to `export default` the class directly leads to problems when it's used as a dependency
export default SerialIO
