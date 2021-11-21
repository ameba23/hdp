const Hyperswarm = require('hyperswarm')
const EventEmitter = require('events')
const Fuse = require('./lib/fuse')
const log = require('debug')('hdp')
const Hdpfs = require('./lib/fs')
const { nameToTopic } = require('./lib/crypto')
const Peer = require('./lib/peer')
const Rpc = require('./lib/rpc')
const handshake = require('./lib/handshake')

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this

    this.hyperswarm = new Hyperswarm({ seed: options.seed })
    this.peers = {}
    this.fs = new Hdpfs()
    this.shares = options.shares
    if (!Array.isArray(this.shares)) this.shares = [this.shares]
    log('Shares', this.shares)
    this.options = options
    this.fuse = new Fuse(this.fs, { mountDir: options.mountDir })
    this.rpc = new Rpc(this.shares)
    this.topics = []

    process.once('SIGINT', () => { self.stop() })

    this.hyperswarm.on('connection', async (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      if (self.peers[remotePk]) {
        log('Duplicate connection')
        self.peers[remotePk].setConnection(conn)
      }

      let handshakeErr
      await handshake(info.topics, conn, this.topics).catch(() => {
        log('Handshake failed, dropping connection')
        handshakeErr = true
      })
      if (handshakeErr) return

      self.peers[remotePk] = self.peers[remotePk] || new Peer(conn, self.rpc)

      const name = await self.peers[remotePk].getName()
      log(`Peer ${name} connected.`)
      self.fs.peerNames[name] = self.peers[remotePk]
      self.emit('connection')

      conn.once('close', async () => {
        log(`Peer ${name} disconnected`)
        console.log(conn)
        await new Promise((resolve) => { setTimeout(resolve, 2000) })
        delete self.peers[remotePk]
      })
    })
  }

  async join (name) {
    log(`Joining ${name}`)
    this.topics.push(name)

    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    await Promise.all([
      discovery.flushed(), // Waits for the topic to be fully announced on the DHT
      this.hyperswarm.flush() // Waits for the swarm to connect to pending peers.
    ]).catch((err) => { log(`Connection closed before flush ${err}`) })
    log('Finished connecting to pending peers')
  }

  async leave (name) {
    log(`Leaving ${name}`)
    await this.hyperswarm.leave(nameToTopic(name))
    log(`Left ${name}`)
  }

  async stop (dontExit) {
    log('Closing down...')
    await Promise.all([
      this.rpc.closeAll(), // Close all open fds
      this.fuse.unmount(), // Unmount if mounted
      this.hyperswarm.destroy()
    ]).catch((err) => {
      console.log(err)
    })
    if (!dontExit) process.exit()
  }
}

// function logEvents (emitter, name) {
//   const emit = emitter.emit
//   name = name ? `(${name}) ` : ''
//   emitter.emit = (...args) => {
//     console.log(`\x1b[33m    ----${args[0]}\x1b[0m`)
//     emit.apply(emitter, args)
//   }
// }
