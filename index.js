const Hyperswarm = require('hyperswarm')
const { HdpMessage } = require('./lib/messages')
const { printKey } = require('./lib/util')
const EventEmitter = require('events')
const log = require('debug')('hdp')
const fs = require('fs')
const { join } = require('path')
const { nameToTopic } = require('./lib/crypto')
const Peer = require('./lib/peer')


module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this
    this.hyperswarm = new Hyperswarm()
    this.peers = {}
    this.peerNames = {}
    this.hyperswarm.on('connection', (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      this.peers[remotePk] = new Peer(conn, self)
      this.peerNames[printKey(conn.remotePublicKey)] = this.peers[remotePk]
      this.emit('connection')
    })
    this.shares = options.shares || []
    this.basePath = this.shares[0] // temp
  }

  async connect (name) {
    log('Joining ', name)
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    // await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
  }

  onReadDir(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    fs.readdir(join(this.basePath, path), (err, files) => {
      self.peers[remotePk].respondReadDir(err, files, path)
    })
  }

  onStat(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    fs.stat(join(this.basePath, path), (err, stat) => {
      self.peers[remotePk].respondStat(err, stat, path)
    })
  }

  async readDir (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      const files = []
      for (const peerName in this.peerNames) {
        files.push(peerName)
      }
      return files
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      return this.peerNames[path[0]].readDir(path.slice(1).join('/'))
    }
    throw new Error('no file')
  }

  async stat (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO invent some stat object here
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      return this.peerNames[path[0]].stat(path.slice(1).join('/'))
    }
    console.log(path)
    throw new Error('no file')
  }
}
