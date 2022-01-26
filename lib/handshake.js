const crypto = require('./crypto')

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
    if (!foundName) throw new Error('Handshake failed - could not find topic name')

    randomToken = crypto.randomBytes(32)
    conn.write(crypto.secretBox(randomToken, crypto.genericHash(Buffer.from(foundName))))
  }
  return new Promise((resolve, reject) => {
    conn.once('data', (returned) => {
      if (returned.length === 72) {
        for (const name of knownTopics) {
          try {
            const decrypted = crypto.secretUnbox(returned, crypto.genericHash(Buffer.from(name)))
            if (decrypted) {
              conn.write(decrypted)
              return resolve()
            }
          } catch (err) {
            return reject(err)
          }
        }
        return reject(new Error('Handshake failed - could not decrypt handshake'))
      }
      if (!randomToken) return reject(new Error('Handshake failed - unexpected response'))
      if (Buffer.compare(returned, randomToken)) {
        reject(new Error(`Handshake failed - bad handshake response. Need a 32 byte token, got ${returned.length} bytes`))
      } else { resolve() }
    })
  })
}
