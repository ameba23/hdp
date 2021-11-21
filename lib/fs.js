const { createError } = require('./util')
const { ENOENT, EBADF } = require('fuse-native')

module.exports = class Fs {
  constructor () {
    this.peerNames = {}
    this.remoteFileDescriptors = []
    this.ctime = Date.now() // TODO
    this.rootStat = createStat({
      atime: this.ctime, // TODO
      mtime: this.ctime,
      ctime: this.ctime
      // size: 4096 // TODO
    })
  }

  async readdir (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO just return Object.keys(this.peerNames)?
      const files = []
      for (const peerName in this.peerNames) {
        files.push(peerName)
      }
      return files
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      return this.peerNames[path[0]].readdir(path.slice(1).join('/'))
    }
    throw createError(ENOENT)
  }

  async stat (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      return createStat({
        nlink: Object.keys(this.peerNames).length + 2,
        atime: this.ctime, // TODO
        mtime: this.ctime,
        ctime: this.ctime
      })
      // return this.rootStat
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      return this.peerNames[path[0]].stat(path.slice(1).join('/'))
    }
    throw createError(ENOENT)
  }

  async open (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO decide whether to allow opening directories
      console.log('Attempting to open root directory - not sure what to do')
      process.exit(1)
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      const fd = await this.peerNames[path[0]].open(path.slice(1).join('/'))
      this.remoteFileDescriptors.push({ peer: path[0], fd })
      return this.remoteFileDescriptors.length - 1
    }
    throw createError(ENOENT)
  }

  async read (fd, buf, len, pos) {
    const remoteFd = this.remoteFileDescriptors[fd]
    if (!remoteFd) throw createError(EBADF)
    const readResponse = await this.peerNames[remoteFd.peer].read(remoteFd.fd, len, pos)
    if (buf) readResponse.data.copy(buf)
    return readResponse
  }

  async close (fd) {
    const remoteFd = this.remoteFileDescriptors[fd]
    if (!remoteFd) throw createError(EBADF)
    return this.peerNames[remoteFd.peer].close(remoteFd.fd)
  }
}

const defaultStat = {
  // nlink: 1,
  uid: process.getuid(),
  gid: process.getgid(),
  mode: 16877 // TODO
}

function createStat (inputStat) {
  const stat = Object.assign(defaultStat, inputStat)
  stat.atime = new Date(stat.atime)
  stat.ctime = new Date(stat.ctime)
  stat.mtime = new Date(stat.mtime)

  stat.blocks = stat.blocks || stat.size ? Math.ceil(stat.size / 512) : undefined
  return stat
}

module.exports.createStat = createStat
