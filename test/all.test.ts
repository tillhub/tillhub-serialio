import Message from '../src/components/message'
import TransactionHolder from '../src/components/transactionHolder'
import TimeoutError from '../src/errors/TimeoutError'
import SerialIO from '../src/serialIO'

// @ts-ignore
import MockBinding from '@serialport/binding-mock'
// @ts-ignore
import SerialPort from '@serialport/stream'

jest.setTimeout(TransactionHolder.TIMEOUT + 1000)
// const d = Debug('test')

beforeEach(() => {
  // set up fake serial port
  SerialPort.Binding = MockBinding
  MockBinding.createPort('/dev/ttyFAKE1', { echo: true, record: true })
  MockBinding.createPort('/dev/ttyFAKE2', { echo: true, record: true })
})

describe('SerialIO', () => {
  it('can open() and close() if the serial port exists & could be opened', async () => {
    const serialIO = new SerialIO('/dev/ttyFAKE1')

    expect.assertions(7)

    const onOpen = jest.fn()
    const onClose = jest.fn()

    serialIO.onOpen(onOpen)
    serialIO.onClose(onClose)

    expect(serialIO.isOpen()).toEqual(false)

    await expect(serialIO.open()).resolves.toBeUndefined()
    expect(onOpen).toHaveBeenCalledWith(undefined)

    expect(serialIO.isOpen()).toEqual(true)

    await expect(serialIO.close()).resolves.toBeUndefined()
    expect(onOpen).toHaveBeenCalledWith(undefined)

    expect(serialIO.isOpen()).toEqual(false)

  })

  it('fails to open() and close() if the serial port does not exist', async () => {
    const serialIO = new SerialIO('/dev/ttyUNKNOWN')

    expect.assertions(1)

    const onOpen = jest.fn()
    const onClose = jest.fn()

    serialIO.onOpen(onOpen)
    serialIO.onClose(onClose)

    await expect(serialIO.open()).rejects.toBeInstanceOf(Error)
  })

  it('can send and reply to messages', async () => {
    const sender = new SerialIO('/dev/ttyFAKE1')
    const replier = new SerialIO('/dev/ttyFAKE2')

    const message = 'this is a test message'
    const reply = 'this is a test reply'

    expect.assertions(7)

    await expect(sender.open()).resolves.toBeUndefined()
    await expect(replier.open()).resolves.toBeUndefined()

    replier.onMessage((msg) => {
      expect(msg.data).toEqual(message)
      return reply
    })

    let senderLastWrite: Buffer | null
    let replierLastWrite: Buffer | null

    // transmits data between sender & replier
    const interval = setInterval(() => {
      // @ts-ignore
      if (replier._port.binding.lastWrite !== replierLastWrite) {
        // @ts-ignore
        replierLastWrite = replier._port.binding.lastWrite

        if (replierLastWrite !== null) {
          // @ts-ignore
          sender._port.binding.emitData(replierLastWrite)
        }
      }

      // @ts-ignore
      if (sender._port.binding.lastWrite !== senderLastWrite) {
        // @ts-ignore
        senderLastWrite = sender._port.binding.lastWrite

        if (senderLastWrite !== null) {
          // @ts-ignore
          replier._port.binding.emitData(senderLastWrite)
        }
      }
    }, 1)

    // should succeed
    const replyMsg = await sender.sendRequest(message)
    expect(replyMsg).toBeInstanceOf(Message)
    expect(replyMsg && replyMsg.data).toEqual(reply)

    clearInterval(interval)

    await expect(sender.close()).resolves.toBeUndefined()
    await expect(replier.close()).resolves.toBeUndefined()
  })

  it('should throw error replies as Error', async () => {
    const sender = new SerialIO('/dev/ttyFAKE1')
    const replier = new SerialIO('/dev/ttyFAKE2')

    const message = 'this is a very long test message. it is very long, in order to trigger the truncation.' +
      'for this purpose, the message must be over one hundred twenty characters long'
    const errString = 'this is an error'

    expect.assertions(6)

    await expect(sender.open()).resolves.toBeUndefined()
    await expect(replier.open()).resolves.toBeUndefined()

    replier.onMessage((msg) => {
      expect(msg.data).toEqual(message)
      throw new Error(errString)
    })

    let senderLastWrite: Buffer | null
    let replierLastWrite: Buffer | null

    // transmits data between sender & replier
    const interval = setInterval(() => {
      // @ts-ignore
      if (replier._port.binding.lastWrite !== replierLastWrite) {
        // @ts-ignore
        replierLastWrite = replier._port.binding.lastWrite

        if (replierLastWrite !== null) {
          // @ts-ignore
          sender._port.binding.emitData(replierLastWrite)
        }
      }

      // @ts-ignore
      if (sender._port.binding.lastWrite !== senderLastWrite) {
        // @ts-ignore
        senderLastWrite = sender._port.binding.lastWrite

        if (senderLastWrite !== null) {
          // @ts-ignore
          replier._port.binding.emitData(senderLastWrite)
        }
      }
    }, 1)

    // should succeed
    await expect(sender.sendRequest(message)).rejects.toEqual(new Error(errString))

    clearInterval(interval)

    await expect(sender.close()).resolves.toBeUndefined()
    await expect(replier.close()).resolves.toBeUndefined()
  })

  it('should properly dismiss garbage data and still parse message', async (done) => {
    const endpoint = new SerialIO('/dev/ttyFAKE1')

    expect.assertions(3)

    const garbage = Buffer.allocUnsafe(4)
    garbage.writeUInt32BE(13371337, 0)

    const msgString = 'this is not garbage'

    endpoint.onMessage(async (msg) => {
      await expect(endpoint.close()).resolves.toBeUndefined()
      expect(msg.data).toEqual(msgString)
      done()
      return 'ok'
    })

    await expect(endpoint.open()).resolves.toBeUndefined()

    // @ts-ignore
    endpoint._port.binding.emitData(garbage)

    // @ts-ignore
    endpoint._port.binding.emitData(Message.create(Buffer.from('this is not garbage'), Message.TYPE.REQUEST).raw)
    // @ts-ignore
    endpoint._port.binding.emitData(garbage)
  })

  it('should throw a timeout if no message has been received', async () => {
    const endpoint = new SerialIO('/dev/ttyFAKE1')
    await expect(endpoint.open()).resolves.toBeUndefined()
    await expect(endpoint.sendRequest('this is a test string')).rejects.toBeInstanceOf(TimeoutError)
  })

  it('should be able to handle multiple messages in one stream', async (done) => {
    expect.assertions(3)

    const endpoint = new SerialIO('/dev/ttyFAKE1')

    const msg1 = Message.create('this is the first message', Message.TYPE.REQUEST)
    const msg2 = Message.create('this is the second message', Message.TYPE.REQUEST)
    const msg3 = Message.create('this is the third message', Message.TYPE.REQUEST)

    let msgCount = 0

    endpoint.onMessage(async (msg) => {
      msgCount++
      expect([msg1, msg2, msg3].find((m) => m.data === msg.data)).toBeTruthy()
      if (msgCount === 3) {
        await endpoint.close()
        done()
      }
      return 'ok'
    })

    await endpoint.open()

    const allMsg = Buffer.concat([msg1.raw, msg2.raw, msg3.raw])
    // @ts-ignore
    endpoint._port.binding.emitData(allMsg)
  })

  it('should dismiss incomplete messages', async (done) => {
    expect.assertions(2)

    const msg1String = 'this is the first message'
    const msg2String = 'this is the second message'
    let msgCount = 0

    const endpoint = new SerialIO('/dev/ttyFAKE1')

    endpoint.onMessage(async (msg) => {
      msgCount++
      expect(msg.data).toEqual(msg2String)
      return 'ok'
    })

    await endpoint.open()

    let msg1 = Message.create(msg1String, Message.TYPE.REQUEST).raw
    msg1 = msg1.slice(0, msg1.length - 3)
    const msg2 = Message.create(msg2String, Message.TYPE.REQUEST).raw

    const allMsg = Buffer.concat([msg1, msg2])
    // @ts-ignore
    endpoint._port.binding.emitData(allMsg)

    setTimeout(async () => {
      expect(msgCount).toEqual(1)
      await endpoint.close()
      done()
    }, 100)
  })

  it('should parse messages sent via multiple writes', async (done) => {
    expect.assertions(2)

    const msg1String = 'this is the first message'
    let msgCount = 0

    const endpoint = new SerialIO('/dev/ttyFAKE1')

    endpoint.onMessage(async (msg) => {
      msgCount++
      expect(msg.data).toEqual(msg1String)
      return 'ok'
    })

    await endpoint.open()

    const msg1 = Message.create(msg1String, Message.TYPE.REQUEST).raw
    const msgHalfLength = Math.round(msg1.length / 2)

    // split
    const p1 = msg1.slice(0, 6) // slicing it < Message.META_OFFSET to make sure it can handle split header
    const p2 = msg1.slice(6, msgHalfLength)
    const p3 = msg1.slice(msgHalfLength)

    // @ts-ignore
    setTimeout(() => endpoint._port.binding.emitData(p1), 0)
    // @ts-ignore
    setTimeout(() => endpoint._port.binding.emitData(p2), 100)
    // @ts-ignore
    setTimeout(() => endpoint._port.binding.emitData(p3), 200)

    setTimeout(async () => {
      expect(msgCount).toEqual(1)
      await endpoint.close()
      done()
    }, 500)
  })
})
