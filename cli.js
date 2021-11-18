#!/usr/bin/env node
const Hdp = require('.')
const argv = require('minimist')(process.argv.slice(2))
const fs = require('fs')
const mkdirp = require('mkdirp')
const { join } = require('path')
const homeDir = require('os').homedir()

checkNodeVersion()

const storage = argv.storage || join(homeDir, '.hdp')
mkdirp.sync(storage)

// Retrieve identity from file
try {
  argv.seed = fs.readFileSync(join(storage, 'key'))
} catch (err) {
  const sodium = require('sodium-native')
  argv.seed = Buffer.alloc(32)
  sodium.randombytes_buf(argv.seed)
  fs.writeFileSync(join(storage, 'key'), argv.seed)
}

const hdp = Hdp(argv)

if (argv.mount) hdp.fuse.mount()
if (argv.join) hdp.join(argv.join)

function checkNodeVersion () {
  let majorNodeVersion = process.version.split('.')[0]
  if (majorNodeVersion[0] === 'v') majorNodeVersion = majorNodeVersion.slice(1)
  if (parseInt(majorNodeVersion) < 14) {
    console.log('Requires node 14')
    process.exit(1)
  }
}
