const Hdp = require('.')
const wsServer = require('./lib/ws-interface/ws-server')
const { randomBytes } = require('./lib/crypto')
const toml = require('toml')
const fs = require('fs')
const mkdirp = require('mkdirp')
const { join } = require('path')
const { red } = require('chalk')
const homeDir = require('os').homedir()

// Start command for cli to read configuration and start the server

//
// Example configuration file: ~/.hdp/config.toml
//
// shares = [
//   "/home/me/music",
//   "/home/me/film"
// ]
// join = "someplace"
//   `)
//   process.exit(message ? 1 : 0)
// }

exports.command = 'start'

exports.describe = 'start hdp'

exports.builder = (yargs) => {
  return yargs
    .example('hdp start --join someplace --shares \'/home/me/media\' \'home/me/Downloads\'')
    .option('shares', {
      description: 'One of more directories containing media to share'
    })
    .option('join', {
      description: 'Topic name to join - you will connect to peers who enter the same name',
      type: 'array'
    })
    .option('debug', {
      description: 'Turn on debug logging',
      type: 'boolean'
    })
}

exports.handler = function (argv) {
  checkNodeVersion()

  argv.storage = argv.storage || join(homeDir, '.hdp')
  mkdirp.sync(argv.storage)

  // Read config file
  let opts = {}
  try {
    opts = toml.parse(fs.readFileSync(join(argv.storage, 'config.toml')))
  } catch (err) {
    if (!err.code === 'ENOENT') handleError(`Cannot parse config file: ${err}`)
  }

  Object.assign(opts, argv)

  if (!opts.join) handleError('Missing swarm name to join')

  // Retrieve identity from file
  try {
    opts.seed = fs.readFileSync(join(argv.storage, 'key'))
  } catch (err) {
    opts.seed = randomBytes(32)
    fs.writeFileSync(join(argv.storage, 'key'), opts.seed)
  }

  // TODO this doesnt work
  if (opts.debug) process.env.DEBUG = 'hdp*'

  const hdp = Hdp(opts)

  console.log('Starting WS server')
  wsServer(hdp)

  console.log(`Joining ${opts.join}`)
  hdp.join(opts.join)
}

function handleError (message) {
  console.log(red(message))
  process.exit(1)
}

function checkNodeVersion () {
  let majorNodeVersion = process.version.split('.')[0]
  if (majorNodeVersion[0] === 'v') majorNodeVersion = majorNodeVersion.slice(1)
  if (parseInt(majorNodeVersion) < 14) {
    console.log('Requires node 14')
    process.exit(1)
  }
}