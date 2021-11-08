const Hyperswarm = require('hyperswarm')
const { printKey } = require('./lib/util')
const EventEmitter = require('events')
const Fuse = require('./lib/fuse')
const log = require('debug')('hdp')
const Hdpfs = require('./lib/fs')
const { nameToTopic } = require('./lib/crypto')
const Peer = require('./lib/peer')
const Rpc = require('./lib/rpc')

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this
    this.hyperswarm = new Hyperswarm()
    this.peers = {}
    this.hdpfs = new Hdpfs()
    this.shares = options.shares
    if (!Array.isArray(this.shares)) this.shares = [this.shares]
    console.log('Shares', this.shares)
    this.mountDir = options.mountDir
    this.options = options
    this.ctime = Date.now() // TODO
    this.fuse = new Fuse(this.hdpfs)
    this.rpc = new Rpc(this.shares)

    this.hyperswarm.on('connection', (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      console.log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      self.peers[remotePk] = new Peer(conn, this.rpc)
      self.hdpfs.peerNames[printKey(conn.remotePublicKey)] = self.peers[remotePk]
      self.emit('connection')
    })
  }

  async join (name) {
    log(`Joining ${name}`)
    const config = this.options.server
      ? { server: true, client: false }
      : this.options.client
        ? { server: false, client: true }
        : { server: true, client: true }

    const discovery = this.hyperswarm.join(nameToTopic(name), config)
    await discovery.flushed() // Waits for the topic to be fully announced on the DHT
    console.log('Flushed')
    await this.hyperswarm.flush() // Waits for the swarm to connect to pending peers.
    console.log('finished connecting to pending peers')
  }

  async leave (name) {
    log(`Leaving ${name}`)
    this.hyperswarm.leave(nameToTopic(name))
  }
}
