const readline = require('readline')
const fs = require('fs')
const path = require('path')

// Generate a silly name from a public key

async function getLine (filename, lineNumber) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filename)
  })

  let i = 0
  return new Promise((resolve, reject) => {
    rl.on('line', function (line) {
      if (i === lineNumber) {
        resolve(line)
        rl.close()
      }
      i++
    })
    rl.once('close', () => {
      if (i < lineNumber) reject(new Error('Line number too high'))
    })
  })
}

module.exports = async function (key) {
  const l1 = key.readUInt32LE(0) % 28478
  const w1 = await getLine(path.join(path.resolve(__dirname), './words/adjectives.txt'), l1)

  const l2 = key.readUInt32LE(1) % 594
  const w2 = w1 + await getLine(path.join(path.resolve(__dirname), './words/animals.txt'), l2)
  return w2.replace(/ /g, '')
}
