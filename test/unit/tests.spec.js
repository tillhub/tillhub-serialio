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

test('request/reply functionality should work', async (t) => {
  const sender = new SerialIO('/dev/ttyFAKE1')
  const replyer = new SerialIO('/dev/ttyFAKE2')

  const message1 = 'this is a test message'
  const reply1 = 'this is a test reply'
  const message2 = JSON.parse(JSON.stringify({ 'foo': 'bar' }))
  const reply2 = message2
  const message3 = 'the reply to this message should be an error reply'
  const reply3 = 'this is a test error'

  await sender.open()

  await replyer.open()

  replyer.onMessage((msg) => {
    if (msg === message1) {
      return reply1
    } else if (JSON.stringify(msg) === JSON.stringify(message2)) {
      return reply2
    } else if (msg === message3) {
      throw new Error(reply3)
    } else {
      t.fail(`message on reply side does not match any of the defined messages: ${msg}`)
    }
  })

  let senderLastWrite
  let replyerLastWrite

  let interval = setInterval(() => {
    // console.log('replyer last write:', replyer._port.binding.lastWrite)
    if (replyer._port.binding.lastWrite !== replyerLastWrite) {
      replyerLastWrite = replyer._port.binding.lastWrite

      if (replyerLastWrite !== null) {
        sender._port.binding.emitData(replyerLastWrite)
      }
    }

    // console.log('sender last write:', sender._port.binding.lastWrite)
    if (sender._port.binding.lastWrite !== senderLastWrite) {
      senderLastWrite = sender._port.binding.lastWrite

      if (senderLastWrite !== null) {
        replyer._port.binding.emitData(senderLastWrite)
      }
    }
  }, 100)

  // should succeed
  try {
    t.equal(await sender.send(message1), reply1, 'message1 (string) test passed')
  } catch (e) {
    t.fail(`msg1 test failed: ${e.message || e}`)
  }

  // should succeed
  try {
    t.equal(JSON.stringify(await sender.send(message2)), JSON.stringify(reply2), 'message2 (json) test passed')
  } catch (e) {
    t.fail(`msg2 test failed: ${e.message || e}`)
  }

  // should fail
  try {
    await sender.send(message3)
    t.fail('send(message3) fulfilled')
  } catch (e) {
    t.equal(e.message, reply3, 'message3 (Error) test passed')
  }
  t.end()

  clearInterval(interval)
})
