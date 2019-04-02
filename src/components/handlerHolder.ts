import { MessageHandler, PortEventHandler } from './types'

export type HandlerHolder = {
  open?: PortEventHandler
  close?: PortEventHandler
  drain?: PortEventHandler
  error?: PortEventHandler
  message?: MessageHandler
}
