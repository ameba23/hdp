const EventEmitter = require('events')
const { HdpMessage } = require('./messages')

const defaultStat = {
  dev: 0, // TODO
  nlink: 1,
  uid: process.getuid(),
  gid: process.getgid()
}

module.exports = class Peer extends EventEmitter {
  constructor (connection, hdp) {
    super()
    this.files = {}
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
          const files = message.readDirResponse.dir.file
          const path = message.readDirResponse.path
          console.log('readDirResopnse:', path, files)
          self.emit('readDirResponse', path, files)
          break
        case 'statResponse':
          console.log('statResopnse:', message.statResponse)
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
      self.once('readDirResponse', (path, files) => {
        // TODO check path is correct
        resolve(files)
      })
    })
  }

  async stat (path) {
    const self = this
    // TODO check our model - if we have the path, give it
    this.connection.write(HdpMessage.encode({ statRequest: { path } }))
    const statMessage = await new Promise((resolve, reject) => {
      self.once('statResponse', (statMessage) => {
        // TODO check path is correct
        resolve(statMessage.stat)
      })
    })
    return Object.assign(defaultStat, statMessage)
  }

  respondReadDir (err, files, path) {
    const readDirResponse = err ? { err } : { dir: { file: files } }
    readDirResponse.path = path
    this.connection.write(HdpMessage.encode({ readDirResponse }))
  }

  respondStat (err, stat, path) {
    const statResponse = err ? { err } : { stat }
    statResponse.path = path
    this.connection.write(HdpMessage.encode({ statResponse }))
  }
}
