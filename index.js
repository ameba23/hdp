const Hyperswarm = require('hyperswarm')

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp {
  constructor (options) {
    this.hyperswarm = new Hyperswarm()
    this.hyperswarm.on('connection', (conn, info) => {
      console.log('got connection')
      conn.on('data', (data) => {
        console.log('got data', data)
      })
      conn.write('heelo')
    })
  }

  async connect (topic) {
    const discovery = this.hyperswarm.join(topic, { server: true, client: true })
    await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
    console.log('flushed')
  }
}
