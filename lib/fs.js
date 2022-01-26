const { createError } = require('./util')
const { ENOENT, EBADF } = require('fuse-native')
const BLOCK_SIZE = 64 * 1024

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

  // ls is readdir and stat each entry
  async ls (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      return this._connectedPeerNames().map((name) => {
        return Object.assign(createStat(this.peerNames[name].rootStat()), { name })
      })
    }
    if (this._connectedPeerNames().includes(path[0])) {
      return this.peerNames[path[0]].readdir(path.slice(1).join('/'))
    }
    throw createError(ENOENT)
  }

  async find (basepath, searchterm) {
    const path = basepath.split('/').filter(p => p !== '')
    if (!path.length) {
      let results = []
      for (const name of this._connectedPeerNames()) {
        const peerResults = await this.peerNames[name].find('', searchterm)
        results = results.concat(peerResults.map(r => `${name}/${r}`))
      }
      return results
    }
    if (this._connectedPeerNames().includes(path[0])) {
      const peerResults = await this.peerNames[path[0]].find(path.slice(1).join('/'), searchterm)
      return peerResults.map(r => `${path[0]}/${r}`)
    }
    return []
  }

  _connectedPeerNames () {
    const self = this
    return Object.keys(this.peerNames).filter((name) => {
      return !self.peerNames[name].connection.destroyed
    })
  }

  async * createReadStream (pathString, offset) {
    const fd = await this.open(pathString)
    let pos = offset || 0
    let bytesRead
    do {
      const readResponse = await this.read(fd, undefined, BLOCK_SIZE, pos)
      bytesRead = readResponse.bytesRead
      yield readResponse.data
      pos += bytesRead
    } while (bytesRead) // bytesRead === BLOCK_SIZE ?
    await this.close(fd)
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
