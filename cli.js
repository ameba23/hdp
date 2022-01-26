#!/usr/bin/env node
const Hdp = require('.')
const tcpServer = require('./lib/tcp-interface/tcp-server')
const TcpClient = require('./lib/tcp-interface/tcp-client')
const argv = require('minimist')(process.argv.slice(2))
const toml = require('toml')
const fs = require('fs')
const mkdirp = require('mkdirp')
const { join, basename } = require('path')
const { blue, green, red, yellow } = require('chalk')
const homeDir = require('os').homedir()
const { readableBytes, isDir } = require('./lib/util')

checkNodeVersion()

if (argv.help) usage()

const commands = {
  start () {
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

    if (opts.debug) process.env.DEBUG = 'hdp*'

    const hdp = Hdp(opts)

    console.log('Starting TCP server')
    tcpServer(hdp)

    console.log(`Joining ${opts.join}`)
    hdp.join(opts.join)
  },
  ls () {
    const client = new TcpClient()
    client.on('error', handleError)
    client.singleResponseRequest({
      readdir: { path: argv._[1] || '/' }
    }).then((output) => {
      // console.log(output)
      output.success.readdir.files.forEach(f => {
        console.log(
          isDir(f.mode) ? blue(`[${f.name}]`) : yellow(f.name),
          red(readableBytes(f.size))
        )
      })
    }).catch(handleError)
  },
  cat () {
    const client = new TcpClient()
    client.on('error', handleError)

    async function processResponse () {
      for await (const output of client.multiResponseRequest(
        { cat: { path: argv._[1] || '/' } })) {
        console.log(output.success.cat.data.toString())
      }
    }

    processResponse().then(() => {
      console.log('[EOF]') // Temp
    }).catch((err) => {
      console.log(red(err))
    })
  },
  find () {
    const client = new TcpClient()
    client.on('error', handleError)
    client.singleResponseRequest({
      find: { basepath: argv.basepath, searchterm: argv.searchterm }
    }).then((output) => {
      output.success.find.results.forEach(f => {
        console.log(green(f))
      })
    }).catch(handleError)
  }
  // cp () {
  //   const request = new TcpRequest({
  //     cat: { path: argv._[1] || '/' }
  //   })
  //   const writeStream = createWriteStream(argv._[2])
  //   request.client.pipe(writeStream)
  // }
}

if (typeof commands[argv._[0]] !== 'function') {
  usage(`${argv._[0]} is not a command!`)
}

commands[argv._[0]]()

function handleError (err) {
  console.log(red(err))
  // TODO: pass the error code
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

function usage (message) {
  const name = basename(process.argv[1])
  if (message) console.log(red(message))
  console.log(`
Usage: ${name} command options

Commands:
start - start the server

Options:
- ${yellow('shares')} - one or more directories containing media to share
- ${yellow('join')} - topic name to join - you will connect to peers who enter the same name

Example command line usage:

${name} --join someplace --shares '/home/me/media' --mount ./hdp

Example configuration file: ~/.hdp/config.toml

shares = [
  "/home/me/music",
  "/home/me/film"
]
join = "someplace"
  `)
  process.exit(message ? 1 : 0)
}
