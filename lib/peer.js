const EventEmitter = require('events')
const { HdpMessage } = require('./messages')
const { createError } = require('./util')
const { ENOENT, EHOSTUNREACH } = require('fuse-native')
const createStat = require('./fs').createStat
const log = require('debug')('hdp')
const keyToName = require('./key-to-name')
const Cache = require('./cache')

// Handle rpc requests / responses for specific peer

module.exports = class Peer extends EventEmitter {
  constructor (connection, rpc) {
    super()
    this.readdirCache = new Cache()
    this.statCache = new Cache()
    this.remotePk = connection.remotePublicKey.toString('hex')
    this.currentMsgId = -1
    this.rpc = rpc
    this.setConnection(connection)
  }

  setConnection (connection) {
    const self = this
    this.connection = connection
    // TODO rm this listener from the old connection?
    connection.on('data', async (data) => {
      const message = HdpMessage.decode(data)
      log('Got message', message)
      const id = message.id
      if (Object.keys(message).includes('response')) {
        self.emit(id.toString(), message.response)
        return
      }
      const request = message.request
      let output
      try {
        output = await self.rpc.handleRequest(request, self.remotePk)
      } catch (err) {
        console.log(err)
        if (!err.errno) process.exit(1) // TEMP - to catch unexpected errs
        self._sendErrResponse(message, err)
        return
      }
      self._sendResponse(message, output)
    })

    connection.once('close', async () => {
      for (const requestId of self.eventNames()) {
        if (isNaN(parseInt(requestId))) continue
        self.emit(requestId, { err: EHOSTUNREACH })
      }
    })
  }

  async getName () {
    this.name = this.name || await keyToName(this.connection.remotePublicKey)
    return this.name
  }

  async readdir (path) {
    let response = this.readdirCache.get(path)
    if (!response) {
      response = await this._rpcCall({ readdir: { path } })
      // if this is an error response, only cache if it is ENOENT
      if ((!response.err) || (response.err === ENOENT)) {
        this.readdirCache.set(path, response)
      }
    }

    if (response.err) throw createError(response.err)
    return response.success.readdir.files
  }

  async stat (path) {
    // Logic to avoid extra statting using readdircache
    // const pathArray = path.split('/')
    // const f = this.readdirCache[pathArray.slice(0, -1).join('/')]
    // if (f && !f.includes(pathArray.pop())) {
    //   console.log('Found in readdir arrr')
    //   throw createError(ENOENT)
    // }

    let response = this.statCache.get(path)
    if (!response) {
      response = await this._rpcCall({ stat: { path } })
      // if this is an error response, only cache if it is ENOENT
      if ((!response.err) || (response.err === ENOENT)) {
        this.statCache.set(path, response)
      }
    }

    if (response.err) throw createError(response.err, `Error when stating ${path}`)
    return createStat(response.success.stat)
  }

  async open (path) {
    const response = await this._rpcCall({ open: { path } })
    if (response.err) throw createError(response.err)
    return response.success.open.fd
  }

  async read (fd, len, pos) {
    const response = await this._rpcCall({ read: { fd, len, pos } })
    if (response.err) throw createError(response.err)
    return response.success.read
  }

  async close (fd) {
    const response = await this._rpcCall({ close: { fd } })
    if (response.err) throw createError(response.err)
  }

  async _rpcCall (request) {
    const self = this
    if (this.connection.destroyed) throw createError(EHOSTUNREACH)
    if (this.currentMsgId === 4294967295) this.currentMsgId = -1
    this.currentMsgId++
    const id = this.currentMsgId
    this.connection.write(HdpMessage.encode({ id, request }))
    return await new Promise((resolve, reject) => {
      self.once(id.toString(), resolve)
    })
  }

  _sendErrResponse (message, err) {
    if (!err.errno) console.log('Attempting to return error which was not parsed')
    this.connection.write(HdpMessage.encode({
      id: message.id,
      response: { err: err.errno }
    }))
  }

  _sendResponse (message, output = {}) {
    const success = {}
    success[Object.keys(message.request)[0]] = output
    this.connection.write(HdpMessage.encode({
      id: message.id,
      response: { success }
    }))
  }
}
