import { MessageHandler, PortEventHandler } from './types';
export declare type HandlerHolder = {
    open?: PortEventHandler;
    close?: PortEventHandler;
    drain?: PortEventHandler;
    error?: PortEventHandler;
    message?: MessageHandler;
};
