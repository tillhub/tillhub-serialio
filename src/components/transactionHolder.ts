import TimeoutError from '../errors/TimeoutError'
import Message from './message'
import { Transaction } from './types'

export default class TransactionHolder {
  public static TIMEOUT = 5000

  public _transactions: { [key: number]: Transaction | undefined } = {}

  public get (id: number) {
    return this._transactions[id]
  }

  public add (transaction: Transaction) {
    // start transaction timeout
    transaction.timeout = setTimeout(() => {
      transaction.reject(new TimeoutError('timeout reached'))
    }, TransactionHolder.TIMEOUT)

    this._transactions[transaction.id] = transaction
  }

  public remove (id: number) {
    // make sure no timeout is running
    const transaction = this._transactions[id]
    if (transaction && transaction.timeout) {
      clearTimeout(transaction.timeout)
    }

    this._transactions[id] = undefined
    return transaction
  }

  public resolve (id: number, msg: Message | undefined) {
    const transaction = this.remove(id)
    if (transaction) {
      transaction.resolve(msg)
    }
  }

  public reject (id: number, error: Error) {
    const transaction = this.remove(id)
    if (transaction) {
      transaction.reject(error)
    }
  }
}
