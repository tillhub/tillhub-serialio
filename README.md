# SerialIO

SerialIO is a small library that allows sending and receiving messages over a serial port.

Message handling is simple and promise-based. It currently does not support concurrent request handling (i.e. further sending of message will be rejected  until a repy is received or the reply timeout has passed).

## Initialization

```javascript
const SerialIO = require('serialio');

const serialIO = new SerialIO('/dev/somePort');
serialIO.open().then(
    () => console.log('port opened'),
    (err) => console.error('unable to open port', err)
)
```

## Sending messages

SerialIO allows to sending strings over the serial port. Additionally, Error instances as messages are handled, as well as objects that can be stringified to JSON.

```javascript
serialIO.sendRequest('PING').then(
  (pong) => console.log(pong),
  (err) => console.error('sending message failed', err)
)

```

## Receiving messages

Requests can be received by declaring an onMessage handler. SerialIO tries to return objects, if they were sent as a JSON string.

Any value returned by the handler will be sent as a reply.

```javascript
serialIO.onMessage((ping) => {
  console.log(ping);
  return 'PONG'
})
```
