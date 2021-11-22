#!/usr/bin/env node
const Hdp = require('.')
const argv = require('minimist')(process.argv.slice(2))
const toml = require('toml')
const fs = require('fs')
const mkdirp = require('mkdirp')
const { join } = require('path')
const homeDir = require('os').homedir()

checkNodeVersion()

if (argv.help) usage()

const storage = argv.storage || join(homeDir, '.hdp')
mkdirp.sync(storage)

// Read config file
let opts = {}
try {
  opts = toml.parse(fs.readFileSync(join(storage, 'config.toml')))
} catch (err) {
  if (!err.code === 'ENOENT') usage(`Cannot parse config file: ${err}`)
}

console.log(opts)
Object.assign(opts, argv)

if (!opts.join) usage('Missing swarm name to join')

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

if (opts.mount) {
  console.log(`Mounting at ${opts.mount}`)
  hdp.fuse.mount()
}

console.log(`Joining ${opts.join}`)
hdp.join(opts.join)

function checkNodeVersion () {
  let majorNodeVersion = process.version.split('.')[0]
  if (majorNodeVersion[0] === 'v') majorNodeVersion = majorNodeVersion.slice(1)
  if (parseInt(majorNodeVersion) < 14) {
    console.log('Requires node 14')
    process.exit(1)
  }
}

function usage (message) {
  if (message) console.log(message)
  console.log(`
Options:
- shares - one or more directories containing media to share
- join - topic name to join - you will connect to peers who enter the same name
- mount - directory to mount to. Will be created if it does not exist. If not given, will not mount.

Example command line usage:

./cli.js --join someplace --shares '/home/me/media' --mount ./hdp

Example configuration file: ~/.hdp/config.toml

shares = [
  "/home/me/music",
  "/home/me/film"
]
mount = "/home/me/hdp"
join = "someplace"
  `)
  process.exit(message ? 1 : 0)
}
