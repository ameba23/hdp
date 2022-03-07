const { WebSocketServer } = require('ws')
const { ClientMessage, ServerMessage } = require('./messages')
const log = require('debug')('hdp-ws-server')

const DEFAULT_PORT = 2323

// Handle WS requests from a client

module.exports = function (hdp) {
  const port = hdp.options.port || DEFAULT_PORT
  const host = hdp.options.host
  const server = new WebSocketServer({ port, host })
  console.log(host, port)

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
    }
  }

  server.on('connection', (connection) => {
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

        try {
          for await (const output of iterator) {
            log('Writing output', command, output)
            connection.send(ServerMessage.encode({
              id: message.id,
              success: { [command]: output }
            }))
          }
          // Send a signal that there is no more responses for this request
          connection.send(ServerMessage.encode({
            id: message.id,
            success: { endResponse: {} }
          }))
        } catch (err) {
          log('Writing error response', err)
          connection.send(ServerMessage.encode({
            id: message.id,
            err: err.errno || 0
          }))
        }
      }
    })
  })

  server.on('error', (err) => {
    throw err
  })
}
