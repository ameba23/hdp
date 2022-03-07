const { createError } = require('./util')
const EventEmitter = require('events')
const { ENOENT, EBADF } = require('./errors')
const Wishlist = require('./wishlist')
const fs = require('fs')
const { join, dirname } = require('path')
const { isDir } = require('./util')
const mkdirp = require('mkdirp')
const log = require('debug')('hdp-fs')

const BLOCK_SIZE = 64 * 1024

module.exports = class Fs extends EventEmitter {
  constructor (storage) {
    super()
    this.peerNames = {}
    this.downloads = {}
    this.remoteFileDescriptors = []
    this.ctime = Date.now() // TODO
    this.wishlist = new Wishlist(join(storage, 'wishlist'))

    const self = this
    this.on('download', (path) => {
      self.downloads[path] = []
    })
    this.on('downloaded', (filepath) => {
      // if Object.keys(self.downloads) has a sub-path of filepath
      // self.downloads[subpath].push(filepath)
    })
  }

  // ls is readdir and stat each entry
  async ls (pathString) {
    const self = this
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      return this._connectedPeerNames().map(name => {
        // Give special permissions to our own top level dir
        const mode = self.peerNames[name].isMe ? 16895 : 16877
        return {
          size: 4096,
          mode,
          name
        }
      })
    }
    if (this._connectedPeerNames().includes(path[0])) {
      return this.peerNames[path[0]].readdir(path.slice(1).join('/'))
    }
    throw createError(ENOENT)
  }

  async * find (basepath, searchterm) {
    const path = basepath.split('/').filter(p => p !== '')
    const peersToSearch = path.length
      ? this._connectedPeerNames().includes(path[0]) ? [path[0]] : []
      : this._connectedPeerNames()

    console.log('searching ', peersToSearch)
    for (const name of peersToSearch) {
      for await (const peerResults of this.peerNames[name].find('', searchterm)) {
        yield peerResults.map(r => `${name}/${r}`)
      }
    }
  }

  async * createReadStream (pathString, opts = {}) {
    const fd = await this.open(pathString)
    let pos = opts.start || 0
    let bytesRead
    do {
      // if (opts.end && opts.end < pos + BLOCK_SIZE) toRead = opts.end - pos
      const readResponse = await this.read(fd, undefined, BLOCK_SIZE, pos)
      bytesRead = readResponse.bytesRead
      yield readResponse.data
      pos += bytesRead
      if (opts.end > pos) break // TODO improve this to read the exact amount
    } while (bytesRead) // bytesRead === BLOCK_SIZE ?
    await this.close(fd)
  }

  async open (pathString) {
    // const peer = this._peerFromPath(pathString)
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO decide whether to allow opening directories
      console.log('Attempting to open root directory - not sure what to do')
      process.exit(1) // temp
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
    await this.peerNames[remoteFd.peer].close(remoteFd.fd)
    delete this.remoteFileDescriptors[fd]
  }

  async * download (path, destination, offset) {
    this.emit('download', path)
    // Check if we already have an active dl from this peer
    const next = await this.wishlist.nextItem(path.split('/')[0])
    const wishlistIndex = await this.wishlist.add(path)
    // const peer = this._peerFromPath(path)
    if (!next) {
      yield * this._download(path, destination, offset)
      console.log('Completed request')
      // await this.wishlist.remove(wishlistIndex)
    }
  }

  // Given a path string, return the associated peer
  _peerFromPath (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) return undefined
    return Object.keys(this.peerNames).includes(path[0])
      ? this.peerNames[path[0]]
      : undefined // throw ENOENT?
  }

  async * _download (path, destination, offset) {
    // TODO make less ugly
    let files
    try {
      // See if it is a directory
      files = await this.ls(path)
    } catch (err) {
      // TODO handle whether ENODIR or ENOENT
      // to save an extra rpc call
      yield * this._downloadFile(path, destination, offset)
    }
    if (!files) return

    // TODO create subdirs on target
    for (const file of files) {
      log('Parsing', file, isDir(file.mode))
      const filePath = join(path, file.name)
      // Check if it is a dir
      if (isDir(file.mode)) {
        yield * this._download(filePath, destination)
      } else {
        yield * this._downloadFile(filePath, join(destination, filePath))
      }
    }
  }

  async * _downloadFile (filePath, destination, offset) {
    log(`Downloading file ${filePath} to ${dirname(destination)}`)
    // TODO maybe move this to avoid unnessary calls to mkdirp
    // TODO handle the case that there exists a file with the same name as
    // the directory
    await mkdirp(dirname(destination))

    // TODO .part suffix
    const writeStream = fs.createWriteStream(destination) // { start: offset }
    writeStream.on('error', (err) => {
      throw err
    })

    let bytesRead = 0
    for await (const data of this.createReadStream(filePath, offset)) {
      writeStream.write(data)
      bytesRead += data.length
      yield { bytesRead, filePath }
    }
    // writeStream.close() ?
    this.emit('downloaded', filePath)
  }

  _connectedPeerNames () {
    const self = this
    return Object.keys(this.peerNames).filter((name) => {
      return !self.peerNames[name].connection.destroyed
    })
  }
}
