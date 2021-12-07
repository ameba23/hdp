#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2))
const { ClientMessage, ServerMessage } = require('./messages')
const net = require('net')
const { red, yellow } = require('chalk')

const port = 8124
const host = 'localhost'

const commands = {
  ls () {
    command({
      readdir: { path: argv._[1] || '/' }
    }).then((output) => {
      console.log(yellow(output))
    }).catch(handleErr)
  },
  find () {

  }
}
if (typeof commands[argv._[0]] !== 'function') {
  usage(`${argv._[0]} is not a command!`)
}

commands[argv._[0]]()

async function command (reqMessage) {
  // TODO id should be a random 32 bit integer
  reqMessage.id = 0
  const client = new net.Socket()

  // TODO add timeout

  client.connect({ port, host }, () => {
    client.write(ClientMessage.encode(reqMessage))
  })

  return new Promise((resolve, reject) => {
    client.on('data', (data) => {
      const message = ServerMessage.decode(data)
      if (message.id !== reqMessage.id) {
        console.log('Response with unexpected id')
        return
      }

      console.log(`Response: ${JSON.stringify(message)}`)
      client.end()
      resolve(message)
    })

    client.on('end', () => {
      console.log('Requested an end to the TCP connection')
    })

    client.on('error', reject)
  })
}

function usage (message) {
  // const command = basename(process.argv[1])
  const command = process.argv[1]
  if (message) console.log(red(message))
  console.log(`
Usage: ${command} options

Options:
- ${yellow('shares')} - one or more directories containing media to share
- ${yellow('join')} - topic name to join - you will connect to peers who enter the same name
- ${yellow('mount')} - directory to mount to. Will be created if it does not exist. If not given, will not mount.

Example command line usage:

${command} --join someplace --shares '/home/me/media' --mount ./hdp

Example configuration file: ~/.hdp/config.toml

shares = [
  "/home/me/music",
  "/home/me/film"
]
mount = "/home/me/hdp"
join = "someplace"
  `)
  process.exit(message ? 1 : 0)
}

function handleErr (err) {
  console.log(red(err))
  // TODO: pass the error code
  process.exit(1)
}
