const crypto = require('./crypto')
const { HdpMessage } = require('./messages')
const log = require('debug')('hdp-handshake')

// Handshake to prove knowledge of topic name
// TODO add protocol version number

module.exports = async function (topics, conn, knownTopics) {
  let randomToken
  if (topics.length) {
    // Go through topics find the right one
    const foundName = knownTopics.find((name) => {
      return topics.find((topic) => {
        return Buffer.compare(crypto.nameToTopic(name), topic) === 0
      })
    })
    log(topics, crypto.nameToTopic(knownTopics[0]), knownTopics[0])
    if (!foundName) throw new Error('Handshake failed - could not find topic name')

    randomToken = crypto.randomBytes(32)

    log('Making handshake request')
    conn.write(HdpMessage.encode({
      id: 0,
      request: {
        handshake: {
          token: crypto.secretBox(randomToken, crypto.genericHash(Buffer.from(foundName)))
        }
      }
    }))
  }
  return new Promise((resolve, reject) => {
    conn.once('data', (returned) => {
      let msg
      try {
        msg = HdpMessage.decode(returned)
      } catch (err) {
        return reject(err)
      }
      if (!isHandshakeMessage(msg)) return reject(new Error(`Not a handshake message ${JSON.stringify(msg)}`))
      if (msg.request) {
        log('Received handshake request')
        const ciphertext = msg.request.handshake.token
        for (const name of knownTopics) {
          try {
            const decrypted = crypto.secretUnbox(ciphertext, crypto.genericHash(Buffer.from(name)))
            if (decrypted) {
              log('Making handshake response')
              conn.write(HdpMessage.encode({
                id: 0,
                response: {
                  success: {
                    handshake: {
                      token: decrypted
                    }
                  }
                }
              }))
              return resolve()
            }
          } catch (err) {
            return reject(err)
          }
        }
        return reject(new Error('Handshake failed - could not decrypt handshake'))
      }
      log('Received handshake response')
      if (!randomToken) return reject(new Error('Handshake failed - unexpected response'))
      if (Buffer.compare(msg.response.success.handshake.token, randomToken)) {
        reject(new Error(`Handshake failed - bad handshake response. Need a 32 byte token, got ${returned.length} bytes`))
      } else { resolve() }
    })
  })
}

function isHandshakeMessage (message) {
  if (message.request && message.request.handshake) return true
  if (message.response && message.response.success.handshake) return true
  return false
}
