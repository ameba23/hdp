const EventEmitter = require('events')
const { HdpMessage } = require('./messages')
const { createError } = require('./util')

const defaultStat = {
  dev: 0, // TODO
  nlink: 1,
  uid: process.getuid(),
  gid: process.getgid()
}

module.exports = class Peer extends EventEmitter {
  constructor (connection, hdp) {
    super()
    this.readDirCache = {}
    this.statCache = {}
    const self = this
    this.remotePk = connection.remotePublicKey.toString('hex')
    this.connection = connection
    connection.on('data', (data) => {
      console.log('got data', HdpMessage.decode(data))
      const message = HdpMessage.decode(data)
      switch (Object.keys(message)[0]) {
        case 'readDirRequest':
          hdp.onReadDir(message.readDirRequest.path, self.remotePk)
          break
        case 'statRequest':
          hdp.onStat(message.statRequest.path, self.remotePk)
          break
        case 'readDirResponse':
          self.emit('readDirResponse', message.readDirResponse)
          break
        case 'statResponse':
          self.emit('statResponse', message.statResponse)
          break
      }
    })
    // this.connection.write(HdpMessage.encode({ readDirRequest: { '/' } }))
  }

  async readDir (path) {
    const self = this
    // TODO check our model - if we have the path, give it
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
      this.connection.write(HdpMessage.encode({ statRequest: { path } }))
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
    return Object.assign(defaultStat, statMessage.stat)
  }

  respondReadDir (err, files, path) {
    const readDirResponse = err ? { err: err.errno } : { dir: { file: files } }
    readDirResponse.path = path
    this.connection.write(HdpMessage.encode({ readDirResponse }))
  }

  respondStat (err, stat, path) {
    const statResponse = err ? { err: err.errno } : { stat }
    statResponse.path = path
    this.connection.write(HdpMessage.encode({ statResponse }))
  }
}
