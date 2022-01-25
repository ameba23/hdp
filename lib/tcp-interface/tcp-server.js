const net = require('net')
const { ClientMessage, ServerMessage } = require('./messages')

const DEFAULT_PORT = 8124

module.exports = function (hdp, options = {}) {
  const server = net.createServer()
  const port = options.port || DEFAULT_PORT

  const singleResponseCommands = {
    async readdir ({ path }) {
      const files = await hdp.fs.ls(path)
      return { files }
    }
  }
  const multiResponseCommands = {
    async * cat ({ path }) {
      for await (const data of hdp.fs.createReadStream(path)) {
        yield { data }
      }
    }
  }

  server.on('connection', (c) => {
    console.log('Client connected')

    c.on('end', () => {
      console.log('Client disconnected')
    })

    c.on('error', (err) => {
      console.log('Error on connection', err)
    })

    c.on('data', async (data) => {
      // TODO try catch
      const message = ClientMessage.decode(data)
      console.log('Server got message: ', message)
      const command = Object.keys(message).filter(p => p !== 'id')[0]

      if (typeof singleResponseCommands[command] === 'function') {
        singleResponseCommands[command](message[command])
          .then((output) => {
            c.write(ServerMessage.encode({
              id: message.id,
              success: { [command]: output }
            }))
          })
          .catch((err) => {
            c.write(ServerMessage.encode({
              id: message.id,
              err: err.errno
            }))
          })
      } else if (typeof multiResponseCommands[command] === 'function') {
        for await (const output of multiResponseCommands[command](message[command])) {
          c.write(ServerMessage.encode({
            id: message.id,
            success: { [command]: output }
          }))
        }
        // .catch((err) => {
        //           c.write(ServerMessage.encode({
        //             id: message.id,
        //             err: err.errno
        //           }))
        c.end()
      }
    })
  })

  server.on('error', (err) => {
    throw err
  })

  server.listen(port, () => {
    console.log(`Server bound to ${port}`)
  })
}
