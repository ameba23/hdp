#!/usr/bin/env node
const TcpClient = require('./lib/tcp-interface/tcp-client')
const { blue, green, red, yellow } = require('chalk')
const { readableBytes, isDir } = require('./lib/util')
const yargs = require('yargs/yargs')

const DEFAULT_PORT = 8124

const argv = yargs(process.argv.slice(2))
  .command(require('./start'))
  .command({
    command: 'ls [path]',
    desc: 'list files',
    builder: (yargs) => {
      yargs.default('path', '/')
    },
    handler: (argv) => {
      tcpRequest({
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
      tcpRequest(
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
      // TODO basepath option
    },
    handler: (argv) => {
      tcpRequest(
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
      tcpRequest(
        { download: { path: argv.file, destination: argv.destination } },
        (output) => {
          console.log('Writing chunk ', output.bytesRead)
        }).catch(handleError)
    }
  })
  .option('port', {
    description: 'TCP port',
    type: 'number',
    default: DEFAULT_PORT
  })
  .option('host', {
    description: 'TCP host',
    default: 'localhost'
  })
  .demandCommand()
  .help()
  .recommendCommands()
  .strict() // Maybe remove this when stable
  .argv

// console.log(argv)

async function tcpRequest (request, handleOutput) {
  const client = new TcpClient()
  client.on('error', handleError)

  const requestType = Object.keys(request)[0]
  for await (const output of client.request(request)) {
    handleOutput(output.success[requestType])
  }
}

// cp () {
//   const request = new TcpRequest({
//     cat: { path: argv._[1] || '/' }
//   })
//   const writeStream = createWriteStream(argv._[2])
//   request.client.pipe(writeStream)
// }

function handleError (err) {
  console.log(red(err))
  // TODO: pass the error code
  process.exit(1)
}
