const fs = require('fs')
const { join } = require('path')
const { createError } = require('./util')
const { ENOENT } = require('fuse-native')

module.exports = class Rpc {
  constructor(shares) {
    this.shares = shares
    for (const share of shares) {
      fs.statSync(share)
    }
    this.fileDescriptors = {}
  }

  async onReadDir(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    if (!this.shares.length) {
      if (path === '/' || path === '') {
        return []
      } else {
        throw createError(ENOENT)
      }
    }
    const files = await fs.promises.readdir(join(this.shares[0], path))
    return files
  }

  async onStat(path, remotePk) {
    const self = this
    return fs.promises.stat(join(this.shares[0], path))
  }

  async onOpen (path, remotePk) {
    const fileHandle = await fs.promises.open(join(this.shares[0], path))
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
