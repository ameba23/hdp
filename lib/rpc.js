const fs = require('fs')
const { join } = require('path')
const { createError } = require('./util')
const createStat = require('./fs').createStat
const { ENOENT } = require('fuse-native')

module.exports = class Rpc {
  constructor (shares) {
    this.shares = shares
    this.shareNames = {}
    for (const share of shares) {
      // Check that the share directories exist
      fs.statSync(share)
      const shareName = share.split('/').filter(s => s !== '').slice(-1)
      this.shareNames[shareName] = share
    }
    this.fileDescriptors = {}
    this.ctime = Date.now() // TODO
    this.rootStat = createStat({
      atime: this.ctime, // TODO
      mtime: this.ctime,
      ctime: this.ctime,
      size: 4096 // TODO
    })
  }

  resolvePath (path) {
    if (!Object.keys(this.shareNames).includes(path[0])) throw createError(ENOENT)
    return join(this.shareNames[path[0]], path.slice(1).join('/'))
  }

  async onReadDir (pathString, remotePk) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) return Object.keys(this.shareNames)
    return fs.promises.readdir(this.resolvePath(path))
  }

  async onStat (pathString, remotePk) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) return this.rootStat
    return fs.promises.stat(this.resolvePath(path))
  }

  async onOpen (pathString, remotePk) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO decide whether to allow opening directories
    }
    const fileHandle = await fs.promises.open(this.resolvePath(path))
    this.fileDescriptors[fileHandle.fd] = fileHandle
    return fileHandle.fd
  }

  async onRead (fd, len, pos, remotePk) {
    if (!this.fileDescriptors[fd]) return // TODO
    const data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
    return { data, bytesRead }
  }

  onClose (fd, remotePk) {
    if (!this.fileDescriptors[fd]) return // TODO
    return this.fileDescriptors[fd].close()
  }
}
