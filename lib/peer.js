const EventEmitter = require('events')
const { HdpMessage } = require('./messages')
const { createError, printKey } = require('./util')
const createStat = require('./fs').createStat

module.exports = class Peer extends EventEmitter {
  constructor (connection, rpc) {
    super()
    this.readDirCache = {}
    this.statCache = {}
    const self = this
    this.remotePk = connection.remotePublicKey.toString('hex')
    this.name = printKey(connection.remotePublicKey)
    this.connection = connection

    connection.on('data', async (data) => {
      console.log('got data', HdpMessage.decode(data))
      const message = HdpMessage.decode(data)
      // TODO DRY up the response handling
      const messageType = Object.keys(message)[0]
      if (messageType.slice(-8) === 'Response') {
        self.emit(messageType, message[messageType])
      }
      switch (Object.keys(message)[0]) {
        case 'readDirRequest':
          try {
            const output = await rpc.onReadDir(message.readDirRequest.path, self.remotePk)
            self.sendResponse('readDirResponse', undefined, { dir: { file: output } }, message.readDirRequest.path)
          } catch (err) {
            self.sendResponse('readDirResponse', err, undefined, message.readDirRequest.path)
          }
          break
        case 'statRequest':
          try {
            const stat = await rpc.onStat(message.statRequest.path, self.remotePk)
            self.sendResponse('statResponse', undefined, { stat }, message.statRequest.path)
          } catch (err) {
            self.sendResponse('statResponse', err, undefined, message.statRequest.path)
          }
          break
        case 'openRequest':
          try {
            const fd = await rpc.onOpen(message.openRequest.path, self.remotePk)
            self.sendResponse('openResponse', undefined, { fd }, message.openRequest.path)
          } catch (err) {
            self.sendResponse('openResponse', err, undefined, message.openRequest.path)
          }
          break
        case 'readRequest':
          try {
            const { fd, len, pos } = message.readRequest
            const { data, bytesRead } = await rpc.onRead(fd, len, pos, self.remotePk)
            self.sendResponse('readResponse', undefined, { fd, len, pos, data, bytesRead })
          } catch (err) {
            const { fd, len, pos } = message.readRequest
            self.sendResponse('readResponse', err, { fd, len, pos })
          }
          break
        case 'closeRequest':
          try {
            const fd = message.closeRequest.fd
            rpc.onClose(fd, self.remotePk)
            self.sendResponse('closeResponse', undefined, { fd })
          } catch (err) {
            const fd = message.closeRequest.fd
            self.sendResponse('closeResponse', err, { fd })
          }
          break
      }
    })
  }

  async readDir (path) {
    const self = this
    const readDirMessage = this.readDirCache[path] || await new Promise((resolve, reject) => {
      this.connection.write(HdpMessage.encode({ readDirRequest: { path } }))
      const readDirMessageListener = (readDirMessage) => {
        if (readDirMessage.path !== path) return
        self.removeListener('readDirResponse', readDirMessageListener)
        delete readDirMessage.path
        self.readDirCache[path] = readDirMessage
        resolve(readDirMessage)
      }
      self.on('readDirResponse', readDirMessageListener)
    })
    if (readDirMessage.err) throw createError(readDirMessage.err)
    return readDirMessage.dir.file
  }

  async stat (path) {
    const self = this

    const statMessage = this.statCache[path] || await new Promise((resolve, reject) => {
      self.connection.write(HdpMessage.encode({ statRequest: { path } }))
      const statMessageListener = (statMessage) => {
        if (statMessage.path !== path) return
        self.removeListener('statResponse', statMessageListener)
        delete statMessage.path
        self.statCache[path] = statMessage
        resolve(statMessage)
      }
      self.on('statResponse', statMessageListener)
    })
    if (statMessage.err) throw createError(statMessage.err)
    return createStat(statMessage.stat)
  }

  async open (path) {
    const self = this
    const openMessage = await new Promise((resolve, reject) => {
      self.connection.write(HdpMessage.encode({ openRequest: { path } }))
      const openMessageListener = (openMessage) => {
        if (openMessage.path !== path) return
        self.removeListener('openResponse', openMessageListener)
        delete openMessage.path
        resolve(openMessage)
      }
      self.on('openResponse', openMessageListener)
    })
    if (openMessage.err) throw createError(openMessage.err)
    return openMessage.fd
  }

  async read (fd, len, pos) {
    const self = this
    const readMessage = await new Promise((resolve, reject) => {
      self.connection.write(HdpMessage.encode({ readRequest: { fd, len, pos } }))
      const readMessageListener = (readMessage) => {
        if (readMessage.fd !== fd) return
        if (readMessage.len !== len) return
        if (readMessage.pos !== pos) return
        self.removeListener('readResponse', readMessageListener)
        delete readMessage.fd
        delete readMessage.len
        delete readMessage.pos
        resolve(readMessage)
      }
      self.on('readResponse', readMessageListener)
    })
    if (readMessage.err) throw createError(readMessage.err)
    return readMessage
  }

  async close (fd) {
    const self = this
    const closeMessage = await new Promise((resolve, reject) => {
      self.connection.write(HdpMessage.encode({ closeRequest: { fd } }))
      const closeMessageListener = (closeMessage) => {
        if (closeMessage.fd !== fd) return
        self.removeListener('closeResponse', closeMessageListener)
        resolve(closeMessage)
      }
      self.on('closeResponse', closeMessageListener)
    })
    if (closeMessage.err) throw createError(closeMessage.err)
  }

  sendResponse (messageType, err, output = {}, path) {
    const responseMessage = {}
    if (err) output.err = err.errno
    responseMessage[messageType] = output
    if (path || path === '') responseMessage[messageType].path = path
    this.connection.write(HdpMessage.encode(responseMessage))
  }

  getName () {
    return this.name
  }
}
