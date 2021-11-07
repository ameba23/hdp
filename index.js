const Hyperswarm = require('hyperswarm')
const { HdpMessage } = require('./lib/messages')
const { printKey, createError } = require('./lib/util')
const EventEmitter = require('events')
const Fuse = require('fuse-native')
const log = require('debug')('hdp')
const fs = require('fs')
const { join } = require('path')
const { nameToTopic } = require('./lib/crypto')
const Peer = require('./lib/peer')

const ENOENT = -2 // TODO

module.exports = function (options) {
  return new Hdp(options)
}

class Hdp extends EventEmitter {
  constructor (options = {}) {
    super()
    const self = this
    this.hyperswarm = new Hyperswarm()
    this.peers = {}
    this.fileDescriptors = {}
    this.remoteFileDescriptors = {}
    this.peerNames = {}
    this.hyperswarm.on('connection', (conn, info) => {
      const remotePk = conn.remotePublicKey.toString('hex')
      log(`Pk: ${printKey(conn.publicKey)} Remote: ${printKey(conn.remotePublicKey)}`)
      this.peers[remotePk] = new Peer(conn, self)
      this.peerNames[printKey(conn.remotePublicKey)] = this.peers[remotePk]
      this.emit('connection')
    })
    this.shares = options.shares || []
    this.mountDir = options.mountDir
  }

  async join (name) {
    log(`Joining ${name}`)
    const discovery = this.hyperswarm.join(nameToTopic(name), { server: true, client: true })
    // await discovery.flushed() // Waits for the topic to be fully announced on the DHT

    // await this.swarm.flush() // Waits for the swarm to connect to pending peers.
  }

  async leave (name) {
    log(`Leaving ${name}`)
    this.hyperswarm.leave(nameToTopic(name))
  }

  async mount () {
    const self = this
    this.handlers = this.handlers || this.createHandlers()
    this.fuse = this.fuse || new Fuse(this.mountDir || './mnt', this.handlers, { autoCache: true })

    await new Promise((resolve, reject) => {
      self.fuse.mount((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    log('mounted...')

    process.once('SIGINT', function () {
      self.unmount()
    })
  }

  async unmount () {
    const self = this
    if (!this.fuse) return
    await new Promise((resolve, reject) => {
      self.fuse.unmount((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    log('Unmounted')
    process.exit()
  }

  createHandlers () {
    const self = this
    return {
      getattr (p, cb) {
        log('getattr(%s)', p)
        self.stat(p)
          .then((stat) => {
            cb(0, stat)
          })
          .catch((err) => {
            cb(err.errno || Fuse.ENOENT)
          })
      },
      readdir (p, cb) {
        log('readdir', p)
        self.readdir(p)
          .then((files) => {
            cb(0, files)
          })
        .catch((err) => {
          cb(err.errno || Fuse.ENOENT)
        })
      },
      open (path, flags, cb) {
        log('open', path, flags)
        // TODO throw err if opening for writing
        self.open(path)
          .then((fd) => { cb(0, fd) })
          .catch((err) => { cb(err.errno) })
      },
      read (path, fd, buf, len, pos, cb) {
        log('read', path, fd, len, pos, buf.length)
        self.read(fd, buf, len, pos)
          .then(({ data, bytesRead }) => {
            cb(bytesRead)
          })
          .catch((err) => { cb(err.errno) })
      },
      release (path, fd, cb) {
        log('release', path, fd)
        self.close((fd))
        .then(() => {
          cb(0)
        })
        .catch((err) => {
          cb(err.errno)
        })
      }
    }
  }

  async onReadDir(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    if (!this.shares.length) {
      if (path === '/' || path === '') {
        // self.peers[remotePk].respondReadDir(err, [], path)
        return []
      } else {
        throw createError(ENOENT)
      }
    }
    const files = await fs.promises.readdir(join(this.shares[0], path))
    return files
  }

  onStat(path, remotePk) {
    // Read local dir, respond to peer
    const self = this
    fs.stat(join(this.shares[0], path), (err, stat) => {
      self.peers[remotePk].respondStat(err, stat, path)
    })
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

  async readDir (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      const files = []
      for (const peerName in this.peerNames) {
        files.push(peerName)
      }
      return files
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      return this.peerNames[path[0]].readDir(path.slice(1).join('/'))
    }
    throw createError(ENOENT)
  }

  async stat (pathString) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) {
      // TODO invent some stat object here
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
    }
    if (Object.keys(this.peerNames).includes(path[0])) {
      const fd = await this.peerNames[path[0]].open(path.slice(1).join('/'))
      this.remoteFileDescriptors[fd] = path[0]
      return fd
    }
    throw createError(ENOENT)
  }

  async read (fd, buf, len, pos) {
    if (!this.remoteFileDescriptors[fd]) {
      console.log('Bad fd')
      return // TODO throw err
    }
    const readResponse = await this.peerNames[this.remoteFileDescriptors[fd]].read(fd, len, pos)
    if (buf) readResponse.data.copy(buf)
    return readResponse
  }

  async close (fd) {
    if (!this.remoteFileDescriptors[fd]) return // TODO throw err
    return this.peerNames[this.remoteFileDescriptors[fd]].close(fd)
  }
}
