const Hyperswarm = require('hyperswarm')
const { HdpMessage } = require('./lib/messages')
const { printKey, createError } = require('./lib/util')
const EventEmitter = require('events')
const Fuse = require('./lib/fuse')
const log = require('debug')('hdp')
const fs = require('fs')
const Hdpfs = require('./lib/fs')
const createStat = require('./lib/fs').createStat
const { join } = require('path')
const { nameToTopic } = require('./lib/crypto')
const Peer = require('./lib/peer')

const ENOENT = -2 // TODO

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this
    this.hyperswarm = new Hyperswarm()
    this.peers = {}
    this.hdpfs = new Hdpfs
    this.shares = options.shares || []
    this.mountDir = options.mountDir
    this.ctime = Date.now()
    this.fuse = new Fuse(this.hdpfs)
    this.fileDescriptors = {}

    this.hyperswarm.on('connection', (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      this.peers[remotePk] = new Peer(conn, self)
      this.hdpfs.peerNames[printKey(conn.remotePublicKey)] = this.peers[remotePk]
      this.emit('connection')
    })
  }

  async join (name) {
    log(`Joining ${name}`)
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    // await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
  }

  async leave (name) {
    log(`Leaving ${name}`)
    this.hyperswarm.leave(nameToTopic(name))
  }

  async onReadDir(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    if (!this.shares.length) {
      if (path === '/' || path === '') {
        // self.peers[remotePk].respondReadDir(err, [], path)
        return []
      } else {
        throw createError(ENOENT)
      }
    }
    const files = await fs.promises.readdir(join(this.shares[0], path))
    return files
  }

  onStat(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    fs.stat(join(this.shares[0], path), (err, stat) => {
      self.peers[remotePk].respondStat(err, stat, path)
    })
  }

  async onOpen (path, remotePk) {
    const fileHandle = await fs.promises.open(join(this.shares[0], path))
    this.fileDescriptors[fileHandle.fd] = fileHandle
    return fileHandle.fd
  }

  async onRead (fd, len, pos, remotePk) {
    if (!this.fileDescriptors[fd]) return // TODO
    const data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
    return { data, bytesRead }
  }

  onClose (fd, remotePk) {
    if (!this.fileDescriptors[fd]) return // TODO
    return this.fileDescriptors[fd].close()
  }
}
