const http = require('http')
const fs = require('fs')
const buildUi = require('metadb-ui')
const { join } = require('path')

// Serve the web front end over http

module.exports = async function (storage, options) {
  const uiFilePath = join(storage, 'ui.html')
  await build(uiFilePath, options)
  serveIndex(uiFilePath, options)
}

async function build (uiFilePath, options) {
  const uiFile = fs.createWriteStream(uiFilePath)
  uiFile.on('error', (err) => { return Promise.reject(err) })
  const ui = buildUi(options)
  ui.pipe(uiFile)
  await new Promise((resolve, reject) => {
    ui.on('end', resolve).on('error', reject)
  })
}

async function serveIndex (file, options) {
  // TODO port = options.port || 7000
  const port = 7000
  const server = http.createServer(async (request, response) => {
    if (['/', '/rebuild'].includes(request.url) && request.method === 'GET') {
      if (request.url === '/rebuild') await build(file, options)
      const readStream = fs.createReadStream(file)
      response.writeHead(200,
        { 'Content-Type': 'text/html' })
      for await (const data of readStream) {
        response.write(data)
      }
      response.end()
    } else {
      response.writeHead(200,
        { 'Content-Type': 'text/plain' })
      response.end('404')
    }
  })
  server.listen(port)
}
