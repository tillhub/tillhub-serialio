/// <reference types="node" />
import Message from './message';
import Timeout = NodeJS.Timeout;
export declare type MessageHandler = (msg: Message) => string | Promise<string>;
export declare type PortEventHandler = (error?: Error) => void;
export declare type ParsedMessageHandler = (msg: Message) => void;
/**
 * Simple class holding the message ID of a transaction,
 * as well as the resolve & reject function of the promise given to the sender
 */
export declare type Transaction = {
    id: number;
    resolve: (msg?: Message) => void;
    reject: (error: Error) => void;
    timeout?: Timeout;
};
