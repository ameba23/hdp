#!/usr/bin/env node
const WsClient = require('./lib/ws-interface/ws-client')
const { blue, green, red, yellow } = require('chalk')
const { readableBytes, isDir } = require('./lib/util')
const yargs = require('yargs/yargs')

const DEFAULT_PORT = 2323

const argv = yargs(process.argv.slice(2))
  .command(require('./start'))
  .command({
    command: 'ls [path]',
    desc: 'list files',
    builder: (yargs) => {
      yargs.default('path', '/')
    },
    handler: (argv) => {
      wsRequest({
        readdir: { path: argv.path }
      }, (readdir) => {
        readdir.files.forEach(f => {
          console.log(
            isDir(f.mode) ? blue(`[${f.name}]`) : yellow(f.name),
            red(readableBytes(f.size))
          )
        })
      }).catch(handleError)
    }
  })
  .command({
    command: 'cat <file>',
    desc: 'display contents of a file',
    handler: (argv) => {
      wsRequest(
        { cat: { path: argv.file } },
        (output) => {
          console.log(output.data.toString())
        }).catch(handleError)
    }
  })
  .command({
    command: 'find [searchterm]',
    desc: 'search for files',
    builder: (yargs) => {
      return yargs.option('basepath', {
        description: 'directory to search'
      })
    },
    handler: (argv) => {
      wsRequest(
        { find: { basepath: argv.basepath, searchterm: argv.searchterm } },
        (output) => {
          output.results.forEach(f => {
            console.log(green(f))
          })
        }).catch(handleError)
    }
  })
  .command({
    command: 'download <file> [destination]',
    desc: 'download a file',
    handler: (argv) => {
      wsRequest(
        { download: { path: argv.file, destination: argv.destination } },
        (output) => {
          console.log('Writing chunk ', output.data.length)
        }).catch(handleError)
    }
  })
  .command({
    command: 'wishlist',
    desc: 'display wishlist',
    handler: (argv) => {
      wsRequest(
        { wishlist: {} },
        (output) => {
          console.log(output.item)
        }).catch(handleError)
    }
  })
  .command({
    command: 'join <swarm>',
    desc: 'join swarm',
    handler: (argv) => {
      wsRequest(
        { swarm: { name: argv.swarm, join: true } },
        (output) => {
          console.log(output.item)
        }).catch(handleError)
    }
  })
  .command({
    command: 'leave <swarm>',
    desc: 'leave swarm',
    handler: (argv) => {
      wsRequest(
        { swarm: { name: argv.swarm, join: false } },
        (output) => {
          console.log(output.item)
        }).catch(handleError)
    }
  })
  .option('port', {
    description: 'WS port',
    type: 'number',
    default: DEFAULT_PORT
  })
  .option('host', {
    description: 'WS host',
    default: 'localhost'
  })
  .demandCommand()
  .help()
  .recommendCommands()
  .strict() // Maybe remove this when stable
  .argv

// console.log(argv)

async function wsRequest (request, handleOutput) {
  const client = new WsClient()
  client.on('error', handleError)

  const requestType = Object.keys(request)[0]
  for await (const output of client.request(request)) {
    console.log(output)
    handleOutput(output.success[requestType])
  }
}

// cp () {
//   const request = new Request({
//     cat: { path: argv._[1] || '/' }
//   })
//   const writeStream = createWriteStream(argv._[2])
//   request.client.pipe(writeStream)
// }

function handleError (err) {
  console.log(red(err), err.errno)
  // TODO: pass the error code
  console.log(err)
  process.exit(1)
}
