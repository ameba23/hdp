const EventEmitter = require('events')
const level = require('level')
const { join } = require('path')
const Self = require('./lib/self')
const log = require('debug')('hdp')
const Hdpfs = require('./lib/fs')
const Peer = require('./lib/peer')
const Rpc = require('./lib/rpc')
const Swarms = require('./lib/swarms')

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    this.peers = {}
    this.db = level(join(options.storage, 'db'))
    this.fs = new Hdpfs(options.storage, this.db, this.emit)
    this.options = options

    const self = this
    process.once('SIGINT', () => { self.stop() })

    this.shares = options.shares
    if (!Array.isArray(this.shares)) this.shares = [this.shares]
    log('Shares:', this.shares)

    this.rpc = new Rpc(this.db, this.shares, (...args) => { self.emit(...args) })

    this.on('ready', () => {
      self.swarms = new Swarms(options.seed, self.db, self.emit, async (connection) => {
        const remotePk = connection.remotePublicKey.toString('hex')

        if (self.peers[remotePk]) {
          log('Duplicate connection')
          self.peers[remotePk].setConnection(connection)
        } else {
          self.peers[remotePk] = new Peer(connection, self.rpc)
        }

        const name = await self.peers[remotePk].getName()
        log(`Peer ${name} connected.`)
        await self.fs.addPeer(self.peers[remotePk])
        self.emit('peerConnected', name)

        connection.on('close', () => {
          log(`Peer ${name} disconnected`)
          self.emit('peerDisconnected', name)
        })
      })

      // Create a representation of ourself in our peers list
      self.publicKey = self.swarms.publicKey
      self.peers[self.publicKey] = new Self(self.publicKey, self.rpc)
      self.peers[self.publicKey].getName().then((name) => {
        self.fs.peerNames[name] = self.peers[self.publicKey]
        self.name = name
      })
    })
  }

  async stop (dontExit) {
    log('Closing down...')
    await Promise.all([
      this.rpc.closeAll(), // Close all open fds
      this.swarms.stop()
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
