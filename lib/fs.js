const { createError } = require('./util')
const { ENOENT, EBADF } = require('fuse-native')

module.exports = class Fs {
  constructor () {
    this.peerNames = {}
    this.remoteFileDescriptors = {}
    this.ctime = Date.now() // TODO
    this.rootStat = createStat({
      atime: this.ctime, // TODO
      mtime: this.ctime,
      ctime: this.ctime,
      size: 4096 // TODO
    })
  }

  async readdir (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
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
    if (!path.length) return this.rootStat
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
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      const fd = await this.peerNames[path[0]].open(path.slice(1).join('/'))
      this.remoteFileDescriptors[fd] = path[0]
      return fd
    }
    throw createError(ENOENT)
  }

  async read (fd, buf, len, pos) {
    if (!this.remoteFileDescriptors[fd]) throw createError(EBADF)
    const readResponse = await this.peerNames[this.remoteFileDescriptors[fd]].read(fd, len, pos)
    if (buf) readResponse.data.copy(buf)
    return readResponse
  }

  async close (fd) {
    if (!this.remoteFileDescriptors[fd]) throw createError(EBADF)
    return this.peerNames[this.remoteFileDescriptors[fd]].close(fd)
  }
}

const defaultStat = {
  dev: 0, // TODO
  rdev: 0,
  nlink: 1,
  uid: process.getuid(),
  gid: process.getgid(),
  mode: 16877 // TODO
}

function createStat (inputStat) {
  const stat = Object.assign(defaultStat, inputStat)
  stat.atime = new Date(stat.atime)
  stat.ctime = new Date(stat.ctime)
  stat.mtime = new Date(stat.mtime)

  stat.blocks = stat.blocks || Math.ceil(stat.size / 512)
  return stat
}

module.exports.createStat = createStat
