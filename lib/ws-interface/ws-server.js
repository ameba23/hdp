const { WebSocketServer } = require('ws')
const { ClientMessage, ServerMessage } = require('./messages')
const { randomId } = require('../crypto')
const log = require('debug')('hdp-ws-server')

// Handle WS requests from a client

module.exports = function (hdp, server) {
  const wsServer = new WebSocketServer({ server })

  const commands = {
    async * ls ({ path, searchterm, recursive, omitSelf, omitOthers }) {
      for await (const entries of hdp.fs.ls(path, searchterm, recursive, omitSelf, omitOthers)) {
        yield { entries }
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
            log(`Writing ${id} ${command} ${output}`)
            connection.send(ServerMessage.encode({
              id,
              success: { [command]: output }
            }))
          }
          log(`Writing endResponse ${id}`)
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
      log('Sending endResponse')
      connection.send(ServerMessage.encode({
        id,
        success: { endResponse: {} }
      }))
    })

    connection.send(newMessage({
      swarm: {
        connected: Object.entries(hdp.swarms.swarms).filter(s => s[1]).map(s => s[0]),
        disconnected: Object.entries(hdp.swarms.swarms).filter(s => !s[1]).map(s => s[0])
      }
    }))
    connection.send(newMessage({
      peerConnected: { name: hdp.name, self: true }
    }))
  })

  wsServer.on('error', (err) => {
    throw err // TODO
  })
}

function newMessage (message) {
  const id = randomId()
  const encodedMessage = ServerMessage.encode({ id, success: message })
  // TEMP to test validity
  console.log(message, id)
  console.log(ServerMessage.decode(encodedMessage))
  return encodedMessage
}
