const test = require('tape')
const SerialPort = require('@serialport/stream')
const MockBinding = require('@serialport/binding-mock')

const SerialIO = require('../../')

// set up fake serial port
SerialPort.Binding = MockBinding
MockBinding.createPort('/dev/ttyFAKE1', { echo: false, record: true })
MockBinding.createPort('/dev/ttyFAKE2', { echo: false, record: true })

test('open() and close() should succeed if the serial port exists & could be opened', async (t) => {
  const serialIO = new SerialIO('/dev/ttyFAKE1')

  t.plan(4)

  serialIO.onOpen(() => {
    t.pass('open event fired')
  })

  serialIO.onClose(() => {
    t.pass('close event fired')
  })

  try {
    await serialIO.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }

  try {
    await serialIO.close()
    t.pass('closed successfully')
  } catch (e) {
    t.fail(`failed to close: ${e.message || e}`)
  }

  t.end()
})

test('open() and close() should fail if the serial port does not exist', async (t) => {
  const serialIO = new SerialIO('/dev/ttyFAILING')

  t.plan(2)
  serialIO.onOpen(() => {
    t.fail('open event fired')
  })

  serialIO.onClose(() => {
    t.fail('close event fired')
  })

  try {
    await serialIO.open()
    t.fail('opened successfully')
  } catch (e) {
    t.pass(`failed to open: ${e.message || e}`)
  }

  try {
    await serialIO.close()
    t.fail('closed successfully')
  } catch (e) {
    t.pass(`failed to close: ${e.message || e}`)
  }
  t.end()
})

test('string messages should be received and replied to successfully', async (t) => {
  const sender = new SerialIO('/dev/ttyFAKE1')
  const replier = new SerialIO('/dev/ttyFAKE2')

  const message = 'this is a test message'
  const reply = 'this is a test reply'

  await sender.open()
  await replier.open()

  replier.onMessage((msg) => {
    t.equal(msg, message, 'string message received successfully')
    return reply
  })

  let senderLastWrite
  let replierLastWrite

  // transmits data between sender & replier
  let interval = setInterval(() => {
    if (replier._port.binding.lastWrite !== replierLastWrite) {
      replierLastWrite = replier._port.binding.lastWrite

      if (replierLastWrite !== null) {
        sender._port.binding.emitData(replierLastWrite)
      }
    }

    if (sender._port.binding.lastWrite !== senderLastWrite) {
      senderLastWrite = sender._port.binding.lastWrite

      if (senderLastWrite !== null) {
        replier._port.binding.emitData(senderLastWrite)
      }
    }
  }, 100)

  // should succeed
  try {
    t.equal(await sender.sendRequest(message), reply, 'string reply received successfully')
  } catch (e) {
    t.fail(`sending string message failed: ${e.message || e}`)
  }

  clearInterval(interval)

  await sender.close()
  await replier.close()
  t.end()
})

test('json messages should be received and replied to successfully', async (t) => {
  const sender = new SerialIO('/dev/ttyFAKE1')
  const replier = new SerialIO('/dev/ttyFAKE2')

  const message = { msg: 'message' }
  const reply = { msg: 'reply' }

  await sender.open()
  await replier.open()

  replier.onMessage((msg) => {
    t.equal(JSON.stringify(msg), JSON.stringify(message), 'json message received successfully')
    return reply
  })

  let senderLastWrite
  let replierLastWrite

  // tansmits data between sender & replier
  let interval = setInterval(() => {
    if (replier._port.binding.lastWrite !== replierLastWrite) {
      replierLastWrite = replier._port.binding.lastWrite

      if (replierLastWrite !== null) {
        sender._port.binding.emitData(replierLastWrite)
      }
    }

    if (sender._port.binding.lastWrite !== senderLastWrite) {
      senderLastWrite = sender._port.binding.lastWrite

      if (senderLastWrite !== null) {
        replier._port.binding.emitData(senderLastWrite)
      }
    }
  }, 100)

  // should succeed
  try {
    t.equal(JSON.stringify(await sender.sendRequest(message)), JSON.stringify(reply), 'json reply received successfully')
  } catch (e) {
    t.fail(`sending json message failed: ${e.message || e}`)
  }

  clearInterval(interval)

  await sender.close()
  await replier.close()
  t.end()
})

test('Error replies should be thrown as errors', async (t) => {
  const sender = new SerialIO('/dev/ttyFAKE1')
  const replyer = new SerialIO('/dev/ttyFAKE2')

  const message = 'this is a string message'
  const reply = new Error('this is an error reply')

  await sender.open()

  await replyer.open()

  replyer.onMessage((msg) => {
    t.equal(msg, message, 'message received successfully')
    throw reply
  })

  let senderLastWrite
  let replyerLastWrite

  let interval = setInterval(() => {
    if (replyer._port.binding.lastWrite !== replyerLastWrite) {
      replyerLastWrite = replyer._port.binding.lastWrite

      if (replyerLastWrite !== null) {
        sender._port.binding.emitData(replyerLastWrite)
      }
    }

    if (sender._port.binding.lastWrite !== senderLastWrite) {
      senderLastWrite = sender._port.binding.lastWrite

      if (senderLastWrite !== null) {
        replyer._port.binding.emitData(senderLastWrite)
      }
    }
  }, 100)

  // should succeed
  try {
    await sender.sendRequest(message)
    t.fail('sending request returned successfully')
  } catch (e) {
    t.ok(e instanceof Error)
    t.equal(e.message, reply.message, 'error reply was returned as a thrown error')
  }

  clearInterval(interval)

  await sender.close()
  await replyer.close()
  t.end()
})

test('should properly dismiss garbage data and parse message', async (t) => {
  const endpoint = new SerialIO('/dev/ttyFAKE1')

  endpoint.onOpen(() => {
    t.pass('open event fired')
  })

  try {
    await endpoint.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }

  const garbage = Buffer.allocUnsafe(4)
  garbage.writeUInt32BE(13371337, 0)

  // try {
  //   await endpoint.sendRequest('this is a very long test string, in order to check if the buffer output is getting limited. dsaofkgniodufrngpdfosijngposdfngpdsiofngdfspngdfgndfgpoindigpbnüadjnijgbanaijfgpbnaogfn')
  // } catch (e) {
  //   t.equal(e.message, 'Timeout reached', 'timeout has been reached')
  // }
  // const msg = endpoint._port.binding.lastWrite

  endpoint._port.binding.emitData(garbage)
  endpoint._port.binding.emitData(SerialIO.createMessageBuffer(Buffer.from('this is not garbage'), SerialIO.MESSAGE_TYPE.REQUEST))
  endpoint._port.binding.emitData(garbage)

  setTimeout(async () => {
    await endpoint.close()
    t.end()
  }, 500)
})

test('should throw a timeout if no reply is received', async (t) => {
  const endpoint = new SerialIO('/dev/ttyFAKE1')

  endpoint.onOpen(() => {
    t.pass('open event fired')
  })

  try {
    await endpoint.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }
  let timeout = setTimeout(async () => {
    t.fail('timeout has not been reached')
    await endpoint.close()
    t.end()
  }, SerialIO.REPLY_TIMEOUT + 1000)
  try {
    await endpoint.sendRequest('this is a test string')
    // t.fail('timeout has not been reached')
  } catch (e) {
    t.equal(e.message, 'Timeout reached', 'timeout has been reached')
  } finally {
    clearTimeout(timeout)
    await endpoint.close()
    t.end()
  }
})

test('should be able to handle multiple messages in one stream', async (t) => {
  const endpoint = new SerialIO('/dev/ttyFAKE1')

  endpoint.onOpen(() => {
    t.pass('open event fired')
  })

  let msgCount = 0
  endpoint.onMessage((msg) => {
    msgCount++
    return 'ok'
  })

  try {
    await endpoint.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }

  const msg1 = SerialIO.createMessageBuffer(Buffer.from('this is the first message'), SerialIO.MESSAGE_TYPE.REQUEST)
  const msg2 = SerialIO.createMessageBuffer(Buffer.from('this is the second message'), SerialIO.MESSAGE_TYPE.REQUEST)
  const msg3 = SerialIO.createMessageBuffer(Buffer.from('this is the third message'), SerialIO.MESSAGE_TYPE.REQUEST)

  const allMsg = Buffer.concat([msg1, msg2, msg3])
  endpoint._port.binding.emitData(allMsg)

  setTimeout(async () => {
    t.equal(msgCount, 3, 'all messages were received')
    await endpoint.close()
    t.end()
  }, 500)
})

test('should dismiss incomplete messages', async (t) => {
  const endpoint = new SerialIO('/dev/ttyFAKE1')

  let msg1String = 'this is the first message'
  let msg2String = 'this is the second message'

  endpoint.onOpen(() => {
    t.pass('open event fired')
  })

  let msgCount = 0
  endpoint.onMessage((msg) => {
    msgCount++
    t.equal(msg, msg2String)
    return 'ok'
  })

  try {
    await endpoint.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }

  const msg1 = SerialIO.createMessageBuffer(Buffer.from(msg1String), SerialIO.MESSAGE_TYPE.REQUEST).slice(0, 13)
  const msg2 = SerialIO.createMessageBuffer(Buffer.from(msg2String), SerialIO.MESSAGE_TYPE.REQUEST)

  const allMsg = Buffer.concat([msg1, msg2])
  endpoint._port.binding.emitData(allMsg)

  setTimeout(async () => {
    t.equal(msgCount, 1, 'message was received')
    await endpoint.close()
    t.end()
  }, 500)
})

test('should parse messages sent via multiple writes', async (t) => {
  const endpoint = new SerialIO('/dev/ttyFAKE1')

  let msg1String = 'this is the first message'

  endpoint.onOpen(() => {
    t.pass('open event fired')
  })

  let msgCount = 0
  endpoint.onMessage((msg) => {
    msgCount++
    t.equal(msg, msg1String)
    return 'ok'
  })

  try {
    await endpoint.open()
    t.pass('opened successfully')
  } catch (e) {
    t.fail(`failed to open: ${e.message || e}`)
  }

  const msg1 = SerialIO.createMessageBuffer(Buffer.from(msg1String), SerialIO.MESSAGE_TYPE.REQUEST)
  const msgHalfLength = Math.round(msg1.length / 2)
  // split
  const p1 = msg1.slice(0, 6) // slicing it < 9 to make sure it can handle split header
  const p2 = msg1.slice(6, msgHalfLength)
  const p3 = msg1.slice(msgHalfLength)

  setTimeout(() => endpoint._port.binding.emitData(p1), 0)
  setTimeout(() => endpoint._port.binding.emitData(p2), 100)
  setTimeout(() => endpoint._port.binding.emitData(p3), 200)

  setTimeout(async () => {
    t.equal(msgCount, 1, 'message was received')
    await endpoint.close()
    t.end()
  }, 500)
})
