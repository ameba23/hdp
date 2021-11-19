const { describe } = require('tape-plus')
const Hyperswarm = require('hyperswarm')

const { nameToTopic } = require('../lib/crypto')
const handshake = require('../lib/handshake')

describe('handshake', (context) => {
  context('basic', async (assert) => {
    const alice = new Hyperswarm()
    const bob = new Hyperswarm()
    const swarmName = 'some place'

    await new Promise((resolve, reject) => {
      alice.on('connection', (conn, info) => {
        console.log('connection')
        handshake(info.topics, conn, [swarmName]).then(resolve).catch(reject)
      })

      bob.on('connection', (conn, info) => {
        console.log('connection')
        handshake(info.topics, conn, [swarmName]).then(resolve).catch(reject)
      })
      alice.join(nameToTopic(swarmName), { server: true, client: true })
      bob.join(nameToTopic(swarmName), { server: true, client: true })
    })
    assert.ok(true, 'No errors')

    await Promise.all([
      alice.destroy().catch(console.log),
      bob.destroy().catch(console.log)
    ])
  })

  context('bad topic', async (assert) => {
    const alice = new Hyperswarm()
    const bob = new Hyperswarm()
    const swarmName = 'some place'

    await new Promise((resolve, reject) => {
      alice.on('connection', (conn, info) => {
        console.log('connection')
        handshake(info.topics, conn, ['bad']).then(resolve).catch(reject)
      })

      bob.on('connection', (conn, info) => {
        console.log('connection')
        handshake(info.topics, conn, [swarmName]).then(resolve).catch(reject)
      })
      alice.join(nameToTopic(swarmName), { server: true, client: true })
      bob.join(nameToTopic(swarmName), { server: true, client: true })
    }).catch((err) => {
      assert.ok(err)
    })
    await Promise.all([
      alice.destroy().catch(console.log),
      bob.destroy().catch(console.log)
    ])
  })
})
