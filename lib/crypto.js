const sodium = require('sodium-native')

function genericHash (msg, key) {
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
  nameToTopic
}
