const net = require('net')
const { ClientMessage, ServerMessage } = require('./messages')

const DEFAULT_PORT = 8124

module.exports = function (hdp, options = {}) {
  const server = net.createServer()
  const port = options.port || DEFAULT_PORT

  server.on('connection', (c) => {
    console.log('Client connected')

    c.on('end', () => {
      console.log('Client disconnected')
    })

    c.on('data', (data) => {
      // TODO try catch
      const message = ClientMessage.decode(data)
      console.log('Server got message: ', message)
      const command = Object.keys(message).filter(p => p !== 'id')[0]

      if (command === 'readdir') {
        hdp.fs.readdir(message.readdir.path)
          .then((files) => {
            c.write(ServerMessage.encode({
              id: message.id,
              success: { readdir: { files } }
            }))
          })
          .catch((err) => {
            c.write(ServerMessage.encode({
              id: message.id,
              err: err.errno
            }))
          })
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
