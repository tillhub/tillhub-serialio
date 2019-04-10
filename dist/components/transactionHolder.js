"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TimeoutError_1 = __importDefault(require("../errors/TimeoutError"));
class TransactionHolder {
    constructor() {
        this._transactions = {};
    }
    get(id) {
        return this._transactions[id];
    }
    add(transaction, timeout = TransactionHolder.TIMEOUT) {
        // start transaction timeout
        transaction.timeout = setTimeout(() => {
            transaction.reject(new TimeoutError_1.default('timeout reached'));
        }, timeout);
        this._transactions[transaction.id] = transaction;
    }
    remove(id) {
        // make sure no timeout is running
        const transaction = this._transactions[id];
        if (transaction && transaction.timeout) {
            clearTimeout(transaction.timeout);
        }
        this._transactions[id] = undefined;
        return transaction;
    }
    resolve(id, msg) {
        const transaction = this.remove(id);
        if (transaction) {
            transaction.resolve(msg);
        }
    }
    reject(id, error) {
        const transaction = this.remove(id);
        if (transaction) {
            transaction.reject(error);
        }
    }
}
TransactionHolder.TIMEOUT = 5000;
exports.default = TransactionHolder;
//# sourceMappingURL=transactionHolder.js.map