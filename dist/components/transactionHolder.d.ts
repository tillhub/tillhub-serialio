import Message from './message';
import { Transaction } from './types';
export default class TransactionHolder {
    static TIMEOUT: number;
    _transactions: {
        [key: number]: Transaction | undefined;
    };
    get(id: number): Transaction | undefined;
    add(transaction: Transaction, timeout?: number): void;
    remove(id: number): Transaction | undefined;
    resolve(id: number, msg?: Message): void;
    reject(id: number, error: Error): void;
}
