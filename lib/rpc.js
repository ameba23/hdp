const fs = require('fs').promises
const { statSync } = require('fs')
const { join } = require('path')
const { createError } = require('./util')
const { ENOENT, EBADF } = require('fuse-native')
const walk = require('./fs-walk')
// const Cache = require('./cache')

module.exports = class Rpc {
  constructor (shares) {
    this.shares = shares
    this.shareNames = {}
    for (const share of shares) {
      // Check that the share directories exist
      statSync(share)
      // TODO trim() ?
      const shareArr = share.split('/').filter(s => s !== '')
      if (!shareArr.length) throw new Error('Cannot share root directory')
      const shareName = share.split('/').filter(s => s !== '').slice(-1)
      this.shareNames[shareName] = share
    }
    this.fileDescriptors = {}
    this.ctime = Date.now() // TODO
  }

  async handleRequest (request, remotePk) {
    const type = Object.keys(request)[0]
    return this[type](request[type], remotePk)
  }

  async readdir ({ path }) {
    const pathArr = path.split('/').filter(p => p !== '')
    const filenames = pathArr.length
      ? await fs.readdir(this._resolvePath(pathArr))
      : Object.keys(this.shareNames)

    const files = []
    for (const filename of filenames) {
      const stat = await fs.stat(this._resolvePath([...pathArr, filename]))
      stat.name = filename

      // Convert timestamps from date to int
      stat.atime = stat.atime instanceof Date ? stat.atime.getTime() : 0
      stat.mtime = stat.mtime instanceof Date ? stat.mtime.getTime() : 0
      stat.ctime = stat.ctime instanceof Date ? stat.ctime.getTime() : 0

      files.push(stat)
    }

    return { files }
  }

  async find ({ basepath, searchterm }) {
    const pathArr = basepath.split('/').filter(p => p !== '')
    const basepaths = pathArr.length
      ? [{ relPath: basepath, absPath: this._resolvePath(pathArr) }]
      : Object.keys(this.shareNames).map((s) => {
        return { relPath: s, absPath: this.shareNames[s] }
      })

    const results = []
    for (const b of basepaths) {
      for await (const fullpath of walk(b.absPath)) {
        const relPath = fullpath.slice(b.absPath.length)
        if (relPath.includes(searchterm)) {
          results.push(`${b.relPath}/${relPath}`)
        }
      }
    }
    return { results }
  }

  async open ({ path }, remotePk) {
    // TODO max amount of concurrently open files?
    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) {
      // TODO decide whether to allow opening directories
      console.log('Opening directories not yet implemented')
      process.exit(1) // TEMP
    }
    const fileHandle = await fs.open(this._resolvePath(pathArr))
    fileHandle.peer = remotePk
    this.fileDescriptors[fileHandle.fd] = fileHandle
    return { fd: fileHandle.fd }
  }

  async read ({ fd, len, pos }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    let data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
    if (bytesRead < len) data = data.slice(0, bytesRead)
    return { data, bytesRead }
  }

  async close ({ fd }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    // TODO should we not await?
    await this.fileDescriptors[fd].close()
    return {}
  }

  async closeAll () {
    for (const fileHandle of Object.values(this.fileDescriptors)) {
      await fileHandle.close()
    }
  }

  _resolvePath (path) {
    const shareDir = this.shareNames[path[0]]
    if (!shareDir) throw createError(ENOENT)
    // path.filter(i => i !== '..')
    const absPath = join(shareDir, path.slice(1).join('/'))
    // TODO Check that the path resolves to a subdir of the share
    // if (/^\.\.(\/|$)/.test(relative(shareDir, absPath))) throw createError(ENOENT) // && !isAbsolue(relative)
    return absPath
  }
}
