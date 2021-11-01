const Hyperswarm = require('hyperswarm')
const { HdpMessage } = require('./lib/messages')
const { printKey } = require('./lib/util')
const EventEmitter = require('events')
const sodium = require('sodium-native')
const log = require('debug')('hdp')

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    this.hyperswarm = new Hyperswarm()
    this.hyperswarm.on('connection', (conn, info) => {
      // console.log('got connection', conn)
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      conn.on('data', (data) => {
        console.log('got data', HdpMessage.decode(data))
      })
      conn.write(HdpMessage.encode({ readDirRequest: { path: '/' } }))
    })
    this.shares = options.shares || []
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
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    // await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
  }


}
