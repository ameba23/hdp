#!/usr/bin/env node
const Hdp = require('.')
const argv = require('minimist')(process.argv.slice(2))
const toml = require('toml')
const fs = require('fs')
const mkdirp = require('mkdirp')
const { join } = require('path')
const homeDir = require('os').homedir()

checkNodeVersion()

const storage = argv.storage || join(homeDir, '.hdp')
mkdirp.sync(storage)

// Read config file
let opts = {}
try {
  opts = toml.parse(fs.readFileSync(join(storage, 'config.toml')))
} catch (err) {}

Object.assign(opts, argv)

// Retrieve identity from file
try {
  opts.seed = fs.readFileSync(join(storage, 'key'))
} catch (err) {
  const sodium = require('sodium-native')
  opts.seed = Buffer.alloc(32)
  sodium.randombytes_buf(opts.seed)
  fs.writeFileSync(join(storage, 'key'), opts.seed)
}

const hdp = Hdp(opts)

if (opts.mount) hdp.fuse.mount()
if (opts.join) hdp.join(opts.join)

function checkNodeVersion () {
  let majorNodeVersion = process.version.split('.')[0]
  if (majorNodeVersion[0] === 'v') majorNodeVersion = majorNodeVersion.slice(1)
  if (parseInt(majorNodeVersion) < 14) {
    console.log('Requires node 14')
    process.exit(1)
  }
}
