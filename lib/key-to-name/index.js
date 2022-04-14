const readline = require('readline')
const fs = require('fs')
const path = require('path')

// Deterministically generate a silly name from a public key
// Change of collision is around 16 million.
// More animals would be good

const adjectives = {
  path: path.join(path.resolve(__dirname), 'adjectives.txt'),
  numberLines: 28478
}

const animals = {
  path: path.join(path.resolve(__dirname), 'animals.txt'),
  numberLines: 594
}

module.exports = async function (key) {
  const lineNumber1 = key.readUInt32LE(0) % adjectives.numberLines
  const adjective = await getLine(adjectives.path, lineNumber1)

  const lineNumber2 = key.readUInt32LE(1) % animals.numberLines
  const name = adjective + await getLine(animals.path, lineNumber2)
  return name.replace(/ /g, '')
}

async function getLine (filename, lineNumber) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filename)
  })

  let i = 0
  return new Promise((resolve, reject) => {
    rl.on('line', (line) => {
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
