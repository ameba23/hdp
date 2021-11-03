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
    this.dirCache = {}
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
    this.connection.write(HdpMessage.encode({ readDirRequest: { path } }))
    return new Promise((resolve, reject) => {
      self.once('readDirResponse', (readDirMessage) => {
        // this.readDirCache[path] = readDirMessage
        if (readDirMessage.err) return reject(createError(readDirMessage.err))
        const files = readDirMessage.dir.file
        const path = readDirMessage.path
        console.log('readDirResopnse:', path, files)

        // TODO check path is correct
        // if (files.err) reject(createError(-2))
        resolve(files)
      })
    })
  }

  async stat (path) {
    const self = this

    const statMessage = this.statCache[path] || await new Promise((resolve, reject) => {
      this.connection.write(HdpMessage.encode({ statRequest: { path } }))
      self.once('statResponse', (statMessage) => {
        const path = statMessage.path
        // TODO check path is correct
        delete statMessage.path
        this.statCache[path] = statMessage
        resolve(statMessage)
      })
    })
    if (statMessage.err) throw createError(-2)
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
