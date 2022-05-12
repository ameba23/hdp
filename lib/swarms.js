const Hyperswarm = require('hyperswarm')
const sublevel = require('subleveldown')
const log = require('debug')('hdp-swarm')
const handshake = require('./handshake')
const { hdpProtocolVersion } = require('../package.json')
const { nameToTopic, randomBytes } = require('./crypto')

// Handle connecting to peers using hyperswarm

module.exports = class Swarms {
  constructor (seed, db, emit, addPeer) {
    this.db = sublevel(db, 'S', { valueEncoding: 'json' })
    this.hyperswarm = new Hyperswarm({ seed })
    this.swarms = {}
    this.publicKey = this.hyperswarm.keyPair.publicKey.toString('hex')
    this.emit = emit
    const self = this

    this.hyperswarm.on('connection', async (conn, info) => {
      let handshakeErr
      const remoteProtocolVersion = await handshake(info.topics, conn, Object.keys(self.swarms))
        .catch((err) => {
          log(err)
          log('Dropping connection')
          handshakeErr = true
        })
      if (handshakeErr) return
      log(`Peer has protocol version ${remoteProtocolVersion}, we have ${hdpProtocolVersion}`)
      // TODO check version mismatch

      addPeer(conn)
    })

    this.loadSwarms()
  }

  async loadSwarms () {
    for await (const [swarm, connected] of this.db.iterator()) {
      if (connected) await this.join(swarm)
      this.swarms[swarm] = connected
    }

    // const id = randomBytes(4).readUInt32BE()
    // this.emit('success', id, 'swarm', {
    //   connected: Object.entries(this.swarms).filter(s => s[1]).map(s => s[0]),
    //   disconnected: Object.entries(this.swarms).filter(s => !s[1]).map(s => s[0])
    // })
    // this.emit('endResponse', id)
  }

  async join (name) {
    if (!name) name = randomBytes(32).toString('hex')
    log(`Joining ${name}`)
    this.swarms[name] = true
    this.db.put(name, true)
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    await Promise.all([
      // Waits for the topic to be fully announced on the DHT
      discovery.flushed(),
      // Waits for the swarm to connect to pending peers
      this.hyperswarm.flush()
    ]).catch((err) => { log(`Connection closed before flush ${err}`) })
    log('Finished connecting to pending peers')
  }

  async leave (name) {
    log(`Leaving ${name}`)
    await this.hyperswarm.leave(nameToTopic(name))
    this.swarms[name] = false
    this.db.put(name, false)
    log(`Left ${name}`)
  }

  async stop () {
    await this.hyperswarm.destroy()
    this.swarms = {}
  }
}
