const net = require('net')
const { ClientMessage, ServerMessage } = require('./messages')

const DEFAULT_PORT = 8124

module.exports = function (hdp, options = {}) {
  const server = net.createServer()
  const port = options.port || DEFAULT_PORT

  const commands = {
    async * readdir ({ path }) {
      const files = await hdp.fs.ls(path)
      yield { files }
    },
    async * find ({ basepath, searchterm }) {
      const results = await hdp.fs.find(basepath, searchterm)
      yield { results }
    },
    async * cat ({ path }) {
      for await (const data of hdp.fs.createReadStream(path)) {
        yield { data }
      }
    },
    async * download ({ path, destination }) {
      for await (const bytesRead of hdp.download(path, destination)) {
        yield { bytesRead }
      }
    }
  }

  server.on('connection', (connection) => {
    console.log('TCP Client connected')

    connection.on('end', () => {
      console.log('TCP Client disconnected')
    })

    connection.on('error', (err) => {
      console.log('Error on TCP Connection', err)
    })

    connection.on('data', async (data) => {
      // TODO try catch
      const message = ClientMessage.decode(data)
      console.log('TCP Server got message: ', message)
      const command = Object.keys(message).filter(p => p !== 'id')[0]

      if (typeof commands[command] === 'function') {
        const iterator = commands[command](message[command])

        // iterator.on('error', (err) => {
        // })
        try {
          for await (const output of iterator) {
            connection.write(ServerMessage.encode({
              id: message.id,
              success: { [command]: output }
            }))
          }
        } catch (err) {
          connection.write(ServerMessage.encode({
            id: message.id,
            err: err.errno
          }))
        }
        connection.end()
      }
    })
  })

  server.on('error', (err) => {
    throw err
  })

  server.listen(port, () => {
    console.log(`TCP Server bound to ${port}`)
  })
}
