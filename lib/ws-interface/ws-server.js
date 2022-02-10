const { WebSocketServer } = require('ws')
const { ClientMessage, ServerMessage } = require('./messages')
const log = require('debug')('hdp-ws-server')

const DEFAULT_PORT = 8124

// Handle WS requests from a client

module.exports = function (hdp) {
  const port = hdp.options.port || DEFAULT_PORT
  const host = hdp.options.host
  const server = new WebSocketServer({ port, host })

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
    async * cat ({ path }) {
      for await (const data of hdp.fs.createReadStream(path)) {
        yield { data }
      }
    },
    async * download ({ path, destination }) {
      for await (const bytesRead of hdp.fs.download(path, destination)) {
        yield { bytesRead }
      }
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
        } catch (err) {
          log('Writing error response', err)
          connection.send(ServerMessage.encode({
            id: message.id,
            err: err.errno || 0
          }))
        }
        connection.terminate()
      }
    })
  })

  server.on('error', (err) => {
    throw err
  })

  // server.listen({ port, host }, () => {
  //   console.log(`TCP Server bound to ${port}`)
  // })
}
