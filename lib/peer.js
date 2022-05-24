const EventEmitter = require('events')
const { HdpMessage } = require('./messages')
const { createError } = require('./util')
const log = require('debug')('hdp-peer')
const keyToName = require('./key-to-name')
const Cache = require('./cache')
const { ENOENT, EHOSTUNREACH, ENOTDIR } = require('./errors')
const { isHandshakeMessage } = require('./handshake')

// Handle rpc requests / responses for specific peer

const MAX_INDEX = 2 ** 32 - 1

module.exports = class Peer extends EventEmitter {
  constructor (connection, rpc) {
    super()
    this.cache = new Cache()
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
      if (isHandshakeMessage(message)) return
      const id = message.id
      if (Object.keys(message).includes('response')) {
        self.emit(id.toString(), message.response)
        return
      }
      const request = message.request
      // TODO check err handling here
      try {
        for await (const output of self.rpc.handleRequest(request, self.remotePk, connection, self.name)) {
          self._sendResponse(message, output)
        }
        self._sendEndResponse(message, {})
      } catch (err) {
        console.log('Error on request', err)
        if (!err.errno) process.exit(1) // TEMP - to catch unexpected errs
        self._sendErrResponse(message, err)
      }
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

  async * read (path, start, end) {
    for await (const response of this._rpcCall({ read: { path, start, end } })) {
      if (response.err) throw createError(response.err)
      yield response.success.read
    }
  }

  async * ls (path, searchterm, recursive) {
    const index = JSON.stringify({ path, searchterm, recursive })
    const existingResponses = this.cache.get(index)
    if (existingResponses) {
      for (const response of existingResponses) {
        if (response.err) throw createError(response.err)
        yield response.success.ls.entries
      }
      return
    }
    const responses = []
    log(`ls querying remote peer %${path} ${searchterm}`)
    for await (const response of this._rpcCall({ ls: { path, searchterm, recursive } })) {
      // if this is an error response, only cache if it is ENOENT or ENOTDIR
      if ((!response.err) || ([ENOENT, ENOTDIR].includes(response.err))) {
        responses.push(response)
      }

      if (response.err) throw createError(response.err)
      yield response.success.ls.entries
    }
    this.cache.set(index, responses)
  }

  async * _rpcCall (request) {
    const self = this
    if (this.connection.destroyed) throw createError(EHOSTUNREACH)
    if (this.currentMsgId === MAX_INDEX) this.currentMsgId = -1
    this.currentMsgId++
    const id = this.currentMsgId
    this.connection.write(HdpMessage.encode({ id, request }))

    let data
    do {
      data = await new Promise((resolve, reject) => {
        self.once(id.toString(), resolve)
      })
      if (data.success && data.success.endResponse) return
      log(`Got response to rpc call ${data}`)
      yield data
    } while (data.success)
  }

  _sendErrResponse (message, err) {
    // TODO add misc error code?
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

  _sendEndResponse (message) {
    this.connection.write(HdpMessage.encode({
      id: message.id,
      response: { success: { endResponse: {} } }
    }))
  }
}
