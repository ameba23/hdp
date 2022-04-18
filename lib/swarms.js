const Hyperswarm = require('hyperswarm')
const sublevel = require('subleveldown')
const log = require('debug')('hdp-swarm')
const handshake = require('./handshake')
const { nameToTopic, randomBytes } = require('./crypto')

// Handle connecting to peers using hyperswarm

module.exports = class Swarms {
  constructor (seed, db, addPeer) {
    this.db = sublevel(db, 'S', { valueEncoding: 'json' })
    this.hyperswarm = new Hyperswarm({ seed })
    this.swarms = {}
    this.publicKey = this.hyperswarm.keyPair.publicKey.toString('hex')
    const self = this

    this.hyperswarm.on('connection', async (conn, info) => {
      let handshakeErr
      await handshake(info.topics, conn, Object.keys(self.swarms))
        .catch((err) => {
          log(err)
          log('Dropping connection')
          handshakeErr = true
        })
      if (handshakeErr) return

      addPeer(conn)
    })

    this.loadSwarms()
  }

  async loadSwarms () {
    for await (const [swarm, connected] of this.db.iterator()) {
      if (connected) await this.join(swarm)
      this.swarms[swarm] = connected
    }
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