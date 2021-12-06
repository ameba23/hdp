#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2))
const { ClientMessage, ServerMessage } = require('./messages')
const net = require('net')

const port = 8124
const host = 'localhost'

const client = new net.Socket()

client.connect({ port, host }, () => {
  console.log('TCP connection established with the server.')

  client.write(ClientMessage.encode({
    id: 0,
    readdir: { path: '/' }
  }))
})

client.on('data', (data) => {
  const message = ServerMessage.decode(data)
  console.log(`Data received from the server: ${message}`)

  client.end()
})

client.on('end', () => {
  console.log('Requested an end to the TCP connection')
})

client.on('error', (err) => {
  console.log(err)
})
// argv._[0]
