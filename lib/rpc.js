const fs = require('fs').promises
const { statSync } = require('fs')
const { join, relative } = require('path')
const { createError } = require('./util')
// const createStat = require('./fs').createStat
const { ENOENT, EBADF } = require('fuse-native')
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
    // this.rootStat = createStat({
    //   atime: this.ctime, // TODO
    //   mtime: this.ctime,
    //   ctime: this.ctime
    //   // size: 4096 // TODO
    // })
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

  // async stat ({ path }) {
  //   const pathArr = path.split('/').filter(p => p !== '')
  //   const stat = pathArr.length
  //     ? await fs.stat(this._resolvePath(pathArr))
  //     : createStat({
  //       nlink: this.shares.length + 2,
  //       atime: this.ctime, // TODO
  //       mtime: this.ctime,
  //       ctime: this.ctime,
  //       size: 4096
  //     })
  //   // Convert timestamps from date to int
  //   stat.atime = stat.atime instanceof Date ? stat.atime.getTime() : 0
  //   stat.mtime = stat.mtime instanceof Date ? stat.mtime.getTime() : 0
  //   stat.ctime = stat.ctime instanceof Date ? stat.ctime.getTime() : 0
  //   return stat
  // }

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
    const data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
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
