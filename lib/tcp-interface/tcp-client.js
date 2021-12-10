#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2))
const { ClientMessage, ServerMessage } = require('./messages')
const net = require('net')
const { blue, green, red, yellow } = require('chalk')
const { readableBytes, isDir } = require('../util')

const port = 8124
const host = 'localhost'

class TcpRequest {
  constructor (reqMessage) {
    this.client = new net.Socket()
    this.reqMessage = reqMessage
    // TODO id should be a random 32 bit integer
    this.reqMessage.id = 0

    // TODO add timeout
    this.client.on('error', handleError)

    const self = this
    this.client.connect({ port, host }, () => {
      self.client.write(ClientMessage.encode(self.reqMessage))
    })
  }

  async singleResponse () {
    const self = this
    return new Promise((resolve, reject) => {
      self.client.on('data', (data) => {
        const message = ServerMessage.decode(data)
        if (message.id !== self.reqMessage.id) {
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
}

const commands = {
  ls () {
    const request = new TcpRequest({
      readdir: { path: argv._[1] || '/' }
    })

    request.singleResponse().then((output) => {
      console.log(output)
      output.success.readdir.files.forEach(f => {
        console.log(
          isDir(f.mode) ? blue(`[${f.name}]`) : yellow(f.name),
          red(readableBytes(f.size))
        )
      })
    }).catch(handleError)
  },
  cat () {
    const request = new TcpRequest({
      cat: { path: argv._[1] || '/' }
    })
    request.client.pipe(process.stdout)
  },
  find () {

  }
}
if (typeof commands[argv._[0]] !== 'function') {
  usage(`${argv._[0]} is not a command!`)
}

commands[argv._[0]]()


function usage (message) {
  // const command = basename(process.argv[1])
  const command = process.argv[1]
  if (message) console.log(red(message))
  console.log(`
Usage: ${command} command
  `)
  process.exit(message ? 1 : 0)
}

function handleError (err) {
  console.log(red(err))
  // TODO: pass the error code
  process.exit(1)
}
