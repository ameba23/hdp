const Hyperswarm = require('hyperswarm')
const { HdpMessage } = require('./lib/messages')
const { printKey } = require('./lib/util')
const EventEmitter = require('events')
const sodium = require('sodium-native')
const log = require('debug')('hdp')
const fs = require('fs')
const { join } = require('path')

module.exports = function (options) {
  return new Hdp(options)
}

class Peer {
  constructor (connection, handlers) {
    this.files = {}
    const self = this
    this.connection = connection
    connection.on('data', (data) => {
      console.log('got data', HdpMessage.decode(data))
      const message = HdpMessage.decode(data)
      switch (Object.keys(message)[0]) {
        case 'readDirRequest':
          handlers.onReadDir(message.readDirRequest.path)
          break
        case 'readDirResponse':
          const files = message.readDirResponse.dir.file
          console.log('Resopnse:', files)
      }
    })
    connection.write(HdpMessage.encode({ readDirRequest: { path: '/' } }))
  }

  onReadDir (path) {
    this.connection.write(HdpMessage.encode({ readDirRequest: { path } }))
  }

  onReadDirResponse (path, files) {
    console.log(path, files)
  }

  onStatResponse (path, stat) {

  }

  respondReadDir (err, files) {
    const readDirResponse = err ? { err } : { dir: { file: files } }
    this.connection.write(HdpMessage.encode( { readDirResponse } ))
  }
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this
    this.hyperswarm = new Hyperswarm()
    this.peers = {}
    this.hyperswarm.on('connection', (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      this.peers[remotePk] = new Peer(conn, {
        onReadDir(path) {
          self.onReadDir(path, remotePk)
        }
      })
    })
    this.shares = options.shares || []
    this.basePath = this.shares[0] // temp
  }

  async connect (name) {
    function genericHash (msg, key) {
      const hash = sodium.sodium_malloc(sodium.crypto_generichash_BYTES)
      sodium.crypto_generichash(hash, msg, key)
      return hash
    }
    const SWARM_TOPIC_CONTEXT = genericHash(Buffer.from('hdp'), Buffer.alloc(32))
    function nameToTopic (name) {
      name = Buffer.from(name)
      const topic = genericHash(name, SWARM_TOPIC_CONTEXT)
      return topic
    }
    log('Joining ', name)
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    // await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
  }

  onReadDir(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    fs.readdir(join(this.basePath, path), (err, files) => {
      console.log(err, files)
      self.peers[remotePk].respondReadDir(err, files)
    })
    // self.peers[remotePk].respondReadDir(null, ['readme.txt'])
  }
}
