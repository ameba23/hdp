const EventEmitter = require('events')
const { HdpMessage } = require('./messages')
const { createError } = require('./util')
const { ENOENT } = require('fuse-native')
const createStat = require('./fs').createStat
const log = require('debug')('hdp')
const keyToName = require('./key-to-name')

module.exports = class Peer extends EventEmitter {
  constructor (connection, rpc) {
    super()
    this.readdirCache = {}
    this.statCache = {}
    const self = this
    this.remotePk = connection.remotePublicKey.toString('hex')
    this.connection = connection
    this.currentMsgId = -1

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
        output = await rpc.handleRequest(request)
      } catch (err) {
        self._sendErrResponse(message, err)
      }
      self._sendResponse(message, output)
    })
  }

  async getName () {
    this.name = this.name || await keyToName(this.connection.remotePublicKey)
    return this.name
  }

  async readdir (path) {
    console.log('READDIR called', path)
    const response = this.readdirCache[path] || await this._rpcCall({ readdir: { path } })
    this.readdirCache[path] = response
    if (response.err) throw createError(response.err)
    return response.success.readdir.files
  }

  async stat (path) {
    // Logic to avoid extra statting useing readdircache
    // const pathArray = path.split('/')
    // const f = this.readdirCache[pathArray.slice(0, -1).join('/')]
    // if (f && !f.includes(pathArray.pop())) {
    //   console.log('Found in readdir arrr')
    //   throw createError(ENOENT)
    // }

    const response = this.statCache[path] || await this._rpcCall({ stat: { path } })
    this.statCache[path] = response
    if (response.err) throw createError(response.err, `Error when stating ${path}`)
    return createStat(response.success.stat)
  }

  async open (path) {
    console.log('OPEN called', path)
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
    if (this.currentMsgId === 4294967295) this.currentMsgId = -1
    this.currentMsgId++
    const id = this.currentMsgId
    return new Promise((resolve, reject) => {
      self.connection.write(HdpMessage.encode({ id, request }))
      self.once(id.toString(), resolve)
    })
  }

  _sendErrResponse (message, err) {
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
