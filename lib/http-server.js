const http = require('http')
const https = require('https')
const fs = require('fs')
const buildUi = require('harddrive-party-ui')
const { join } = require('path')
const Koa = require('koa')
const sendFile = require('koa-sendfile')

// Serve the web front end and locally stored files over http

module.exports = async function (hdp, options) {
  const storage = hdp.options.storage
  const uiFile = join(storage, 'ui.html')
  await build(uiFile, options)

  const koa = new Koa()
  koa.use(async (ctx) => {
    if (ctx.request.method !== 'GET') return
    if (['/', '/rebuild'].includes(ctx.request.url)) {
      if (ctx.request.url === '/rebuild') await build(uiFile, options)
      await sendFile(ctx, uiFile)
    } else if (ctx.request.url.startsWith('/downloads')) {
      if (!ctx.request.url.includes('..')) {
        await sendFile(ctx, storage + decodeURIComponent(ctx.request.url))
      }
    } else if (ctx.request.url.startsWith('/shares')) {
      if (!ctx.request.url.includes('..')) {
        const filePath = hdp.rpc.resolvePath(decodeURIComponent(ctx.request.url.slice(8)))
        await sendFile(ctx, filePath)
      }
    }
  })

  const server = (options.certFile && options.keyFile)
    ? https.createServer({
        cert: fs.readFileSync(options.certFile),
        key: fs.readFileSync(options.keyFile)
      }, koa.callback())
    : http.createServer(koa.callback())

  const host = options.host || 'localhost'
  const port = options.port || 2323
  server.listen(port, host, () => {
    console.log(`Web ui available on http://${host}:${port}`)
  })
  return server
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
