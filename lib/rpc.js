const fs = require('fs').promises
const { statSync } = require('fs')
const { join, normalize } = require('path')
const { createError } = require('./util')
const walk = require('./fs-walk')
const { ENOENT, EBADF } = require('./errors')
const Cache = require('./cache')

const MAX_RESULTS_PER_MESSAGE = 2

// RPC - respond to remote requests for operations on the local filesystem
// TODO make it so the share dirs can be modified whilst running - addShare rmShare

module.exports = class Rpc {
  constructor (shares, emit) {
    this.shares = shares
    this.shareNames = {}
    this.readdirCache = new Cache()
    for (const shareRaw of shares) {
      const share = normalize(shareRaw.trim())
      // Check that the share directories exist
      statSync(share)
      const shareArr = share.split('/').filter(s => s !== '')
      if (!shareArr.length) throw new Error('Cannot share root directory')
      const shareName = share.split('/').filter(s => s !== '').slice(-1)
      // TODO this will clobber if the subdir has the same name
      this.shareNames[shareName] = share
    }
    this.fileDescriptors = {}
    this.ctime = Date.now() // TODO
    this.emit = emit
  }

  async * handleRequest (request, remotePk) {
    const type = Object.keys(request)[0]
    if (!this[type]) throw new Error('Request has unknown type')
    yield * this[type](request[type], remotePk)
  }

  async * readdir ({ path }) {
    let files = this.readdirCache.get(path)
    if (!files) {
      const pathArr = path.split('/').filter(p => p !== '')
      const filenames = pathArr.length
        ? await fs.readdir(this._resolvePath(pathArr))
        : Object.keys(this.shareNames) // .map(name => { return { name, isDirectory: () => true } })
      files = []
      for (const filename of filenames) {
        const stat = await fs.stat(this._resolvePath([...pathArr, filename]))
        files.push({
          name: filename,
          mode: stat.mode,
          size: stat.size
          // size: stat.isDirectory() ? getDirSize() : stat.size
        })
      }
      this.readdirCache.set(path, files)
    }
    yield { files }
  }

  async * find ({ basepath, searchterm = '' }) {
    // TODO allow case sensitive search?
    // allow omitting search terms with minus sign prefix?

    const lowerCaseSearchterm = searchterm.toLowerCase()

    const pathArr = basepath.split('/').filter(p => p !== '')
    const basepaths = pathArr.length
      ? [{ relPath: basepath, absPath: this._resolvePath(pathArr) }]
      : Object.keys(this.shareNames).map((s) => {
        return { relPath: s, absPath: this.shareNames[s] }
      })

    let results = []
    for (const basepath of basepaths) {
      for await (const relPath of walk(basepath.absPath)) {
        // TODO decide if to include sharename in search
        if (relPath.toLowerCase().includes(lowerCaseSearchterm)) {
          results.push(join(basepath.relPath, relPath))
          if (results.length === MAX_RESULTS_PER_MESSAGE) {
            yield { results }
            results = []
          }
        }
      }
    }
    if (results.length) yield { results }
  }

  async * open ({ path }, remotePk) {
    // TODO max amount of concurrently open files?
    // this.fileDescriptors.filter(f => f.remotePk === remotePk)

    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) {
      console.log('Opening directories not implemented')
      process.exit(1) // TEMP
    }

    const fullPath = this._resolvePath(pathArr)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) throw createError(ENOENT)
    const fileHandle = await fs.open(this._resolvePath(pathArr))
    fileHandle.peer = remotePk
    this.fileDescriptors[fileHandle.fd] = fileHandle
    yield { fd: fileHandle.fd }
  }

  async * read ({ fd, len, pos }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    let data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
    if (bytesRead < len) data = data.slice(0, bytesRead)
    yield { data }
  }

  async * close ({ fd }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    // TODO should we not await?
    await this.fileDescriptors[fd].close()
    yield {}
  }

  async closeAll () {
    for (const fileHandle of Object.values(this.fileDescriptors)) {
      await fileHandle.close()
    }
  }

  _resolvePath (path) {
    const shareDir = this.shareNames[path[0]]
    if (!shareDir) throw createError(ENOENT)
    // TODO a more descriptive error: .. not allowed
    if (path.includes('..')) throw createError(ENOENT)
    const absPath = join(shareDir, path.slice(1).join('/'))
    // TODO Check that the path resolves to a subdir of the share
    // if (/^\.\.(\/|$)/.test(relative(shareDir, absPath))) throw createError(ENOENT) // && !isAbsolue(relative)
    return absPath
  }
}
