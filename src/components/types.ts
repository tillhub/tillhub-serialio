import Message from './message'
import Timeout = NodeJS.Timeout

export type MessageHandler = (msg: Message) => string | Promise<string>
export type PortEventHandler = (error: Error | undefined) => void

export type ParsedMessageHandler = (msg: Message) => void

/**
 * Simple class holding the message ID of a transaction,
 * as well as the resolve & reject function of the promise given to the sender
 */
export type Transaction = {
  id: number
  resolve: (msg: Message | undefined) => void
  reject: (error: Error) => void
  timeout: Timeout | undefined
}
