const { ClientMessage, ServerMessage } = require('./messages')
const EventEmitter = require('events')
const net = require('net')

module.exports = class TcpClient extends EventEmitter {
  constructor (host, port) {
    super()
    this.host = host || 'localhost'
    this.port = port || 8124
    this.client = new net.Socket()

    const self = this
    this.client.on('error', (err) => {
      self.emit('error', err)
    })
  }

  async singleResponseRequest (reqMessage) {
    await this._request(reqMessage)
    const self = this
    return new Promise((resolve, reject) => {
      self.client.on('data', (data) => {
        const message = ServerMessage.decode(data)
        if (message.id !== reqMessage.id) {
          console.log('Response with unexpected id')
          return
        }

        console.log(`Response: ${JSON.stringify(message)}`)
        resolve(message)
        self.client.end()
      })

      self.client.on('end', () => {
        reject(new Error('Connection closed'))
      })
    })
  }

  async * multiResponseRequest (reqMessage) {
    await this._request(reqMessage)

    for await (const data of this.client) {
      // TODO try/catch decoding errors
      const message = ServerMessage.decode(data)
      if (message.id !== reqMessage.id) {
        console.log('Response with unexpected id')
        continue
      }
      console.log(`Response: ${JSON.stringify(message)}`)
      yield message
    }
    this.client.on('end', () => {
      // TODO
    })
  }

  async _request (reqMessage) {
    this.reqMessage = reqMessage
    // TODO id should be a random 32 bit integer
    this.reqMessage.id = 0
    // TODO add timeout
    if (!this.connected) await this._connect()
    this.client.write(ClientMessage.encode(reqMessage))
  }

  async _connect () {
    const self = this
    return new Promise((resolve, reject) => {
      self.client.connect({ port: self.port, host: self.host }, () => {
        self.connected = true
        resolve()
      })
    })
  }
}
