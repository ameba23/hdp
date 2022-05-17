const sodium = require('sodium-native')

// Crypto operations

function randomBytes (length) {
  const result = Buffer.alloc(length)
  sodium.randombytes_buf(result)
  return result
}

function genericHash (msg, key = Buffer.alloc(32)) {
  const hash = sodium.sodium_malloc(sodium.crypto_generichash_BYTES)
  sodium.crypto_generichash(hash, msg, key)
  return hash
}

const SWARM_TOPIC_CONTEXT = genericHash(Buffer.from('hdp'), Buffer.alloc(32))

function nameToTopic (name) {
  name = Buffer.from(name)
  const topic = genericHash(name, SWARM_TOPIC_CONTEXT)
  return topic
}

module.exports = {
  genericHash,
  nameToTopic,
  randomBytes,

  secretBox (message, secretKey) {
    if (!Buffer.isBuffer(secretKey)) secretKey = Buffer.from(secretKey, 'hex')
    if (!Buffer.isBuffer(message)) message = Buffer.from(message)
    const cipher = sodium.sodium_malloc(message.length + sodium.crypto_secretbox_MACBYTES)
    const nonce = randomBytes(sodium.crypto_secretbox_NONCEBYTES)
    sodium.crypto_secretbox_easy(cipher, message, nonce, secretKey)
    return Buffer.concat([nonce, cipher])
  },

  secretUnbox (cipherWithNonce, secretKey) {
    if (!Buffer.isBuffer(secretKey)) secretKey = Buffer.from(secretKey, 'hex')
    const nonce = cipherWithNonce.slice(0, sodium.crypto_secretbox_NONCEBYTES)
    const cipher = cipherWithNonce.slice(sodium.crypto_secretbox_NONCEBYTES)
    const message = sodium.sodium_malloc(cipher.length - sodium.crypto_secretbox_MACBYTES)
    const success = sodium.crypto_secretbox_open_easy(message, cipher, nonce, secretKey)
    return success ? message : false
  },

  randomId () {
    return randomBytes(4).readUInt32BE()
  }
}
