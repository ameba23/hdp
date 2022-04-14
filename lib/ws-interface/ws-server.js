const { WebSocketServer } = require('ws')
const { ClientMessage, ServerMessage } = require('./messages')
const log = require('debug')('hdp-ws-server')

// Handle WS requests from a client

module.exports = function (hdp, server) {
  const wsServer = new WebSocketServer({ server })

  const commands = {
    async * readdir ({ path }) {
      const files = await hdp.fs.ls(path)
      yield { files }
    },
    async * find ({ basepath, searchterm }) {
      for await (const results of hdp.fs.find(basepath, searchterm)) {
        yield { results }
      }
    },
    async * cat ({ path, start, end }) {
      for await (const data of hdp.fs.createReadStream(path, { start, end })) {
        yield { data }
      }
    },
    async * download ({ path, destination }) {
      for await (const downloadMessage of hdp.fs.download(path, destination)) {
        yield downloadMessage
      }
    },
    async * wishlist () {
      const items = []
      for await (const item of hdp.fs.wishlist.createReadStream()) {
        items.push(item)
        // TODO max number of items in one msg:
        // if (items.length > max) {
        //   yield
        //   items = []
      }
      yield { item: items }
    },
    async * swarm ({ name, join }) {
      const joinOrLeave = join ? 'join' : 'leave'
      await hdp.swarms[joinOrLeave](name)

      yield {
        connected: Object.entries(hdp.swarms.swarms).filter(s => s[1]).map(s => s[0]),
        disconnected: Object.entries(hdp.swarms.swarms).filter(s => !s[1]).map(s => s[0])
      }
    }
  }

  wsServer.on('connection', (connection) => {
    log('WS Client connected')

    connection.on('end', () => {
      log('WS Client disconnected')
    })

    connection.on('error', (err) => {
      log('Error on WS Connection', err)
    })

    connection.on('message', async (data) => {
      // TODO try catch
      const message = ClientMessage.decode(data)
      log('WS Server got message: ', message)
      const command = Object.keys(message).filter(p => p !== 'id')[0]

      if (typeof commands[command] === 'function') {
        const iterator = commands[command](message[command])
        const id = message.id
        try {
          for await (const output of iterator) {
            log('Writing output', command, output)
            connection.send(ServerMessage.encode({
              id,
              success: { [command]: output }
            }))
          }
          // Send a signal that there is no more responses for this request
          connection.send(ServerMessage.encode({
            id,
            success: { endResponse: {} }
          }))
        } catch (err) {
          log('Writing error response', err)
          connection.send(ServerMessage.encode({
            id,
            err: err.errno || 0
          }))
        }
      }
    })

    // Handle internal events
    hdp.on('success', (id, messageType, message) => {
      connection.send(ServerMessage.encode({
        id,
        success: { [messageType]: message }
      }))
    })

    hdp.on('error', (id, err) => {
      connection.send(ServerMessage.encode({
        id,
        err: err.errno || 0
      }))
    })

    hdp.on('endResponse', (id) => {
      connection.send(ServerMessage.encode({
        id,
        success: { endResponse: {} }
      }))
    })
  })

  wsServer.on('error', (err) => {
    throw err // TODO
  })
}
