const Hyperswarm = require('hyperswarm')
const EventEmitter = require('events')
const Self = require('./lib/self')
const log = require('debug')('hdp')
const Hdpfs = require('./lib/fs')
const { nameToTopic, randomBytes } = require('./lib/crypto')
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
    this.fs = new Hdpfs(options.storage, this.emit)
    this.publicKey = this.hyperswarm.keyPair.publicKey.toString('hex')

    this.shares = options.shares
    if (!Array.isArray(this.shares)) this.shares = [this.shares]
    log('Shares:', this.shares)
    this.options = options
    this.rpc = new Rpc(this.shares, this.emit)
    this.swarms = {}

    // Create a representation of ourself in our peers list
    this.peers[this.publicKey] = new Self(this.publicKey, this.rpc)
    this.peers[this.publicKey].getName().then((name) => {
      self.fs.peerNames[name] = self.peers[this.publicKey]
    })

    process.once('SIGINT', () => { self.stop() })

    this.hyperswarm.on('connection', async (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')

      let handshakeErr
      await handshake(info.topics, conn, ['boop']).catch((err) => {
        log(err)
        log('Dropping connection')
        handshakeErr = true
      })
      if (handshakeErr) return

      if (self.peers[remotePk]) {
        log('Duplicate connection')
        self.peers[remotePk].setConnection(conn)
      }

      self.peers[remotePk] = self.peers[remotePk] || new Peer(conn, self.rpc)

      const name = await self.peers[remotePk].getName()
      log(`Peer ${name} connected.`)
      await self.fs.addPeer(self.peers[remotePk])
      self.emit('connection')

      conn.on('close', async () => {
        log(`Peer ${name} disconnected`)
      })
    })
  }

  async join (name) {
    if (!name) name = randomBytes(32).toString('hex')
    log(`Joining ${name}`)
    this.swarms[name] = true
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
    this.swarms[name] = false
    log(`Left ${name}`)
  }

  async stop (dontExit) {
    log('Closing down...')
    await Promise.all([
      this.rpc.closeAll(), // Close all open fds
      this.hyperswarm.destroy()
    ]).catch((err) => {
      console.log(err)
    })
    this.swarms = {}
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
