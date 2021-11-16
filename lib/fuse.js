const FuseNative = require('fuse-native')
const log = require('debug')('hdp')
const mkdirp = require('mkdirp')

module.exports = class Fuse {
  constructor (fs, options = {}) {
    this.fs = fs
    this.mountDir = options.mountDir || './mnt'
    this.mounted = false
  }

  async mount () {
    const self = this
    this.handlers = this.handlers || this.createHandlers()
    await mkdirp(this.mountDir)
    this.fuse = this.fuse || new FuseNative(this.mountDir, this.handlers, { autoCache: true })
    this.mounted = true
    await new Promise((resolve, reject) => {
      self.fuse.mount((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    log('Mounted...')
  }

  async unmount () {
    const self = this
    if (!this.fuse) return
    if (!this.mounted) return
    await new Promise((resolve, reject) => {
      self.fuse.unmount((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    log('Unmounted')
  }

  createHandlers () {
    const fs = this.fs
    return {
      getattr (p, cb) {
        log('getattr(%s)', p)
        fs.stat(p)
          .then((stat) => { cb(0, stat) })
          .catch((err) => {
            cb(err.errno || Fuse.ENOENT)
          })
      },
      readdir (p, cb) {
        log('readdir', p)
        fs.readdir(p)
          .then((files) => { cb(0, files) })
          .catch((err) => {
            cb(err.errno || Fuse.ENOENT)
          })
      },
      open (path, flags, cb) {
        log('open', path, flags)
        // TODO throw err if opening for writing
        fs.open(path)
          .then((fd) => { cb(0, fd) })
          .catch((err) => { cb(err.errno) })
      },
      read (path, fd, buf, len, pos, cb) {
        log('read', path, fd, len, pos, buf.length)
        fs.read(fd, buf, len, pos)
          .then(({ bytesRead }) => {
            cb(bytesRead)
          })
          .catch((err) => { cb(err.errno) })
      },
      release (path, fd, cb) {
        log('release', path, fd)
        fs.close(fd)
          .then(() => { cb(0) })
          .catch((err) => { cb(err.errno) })
      },
      statfs (path, cb) {
        cb(0, {
          bsize: 1000000,
          frsize: 1000000,
          blocks: 1000000,
          bfree: 1000000,
          bavail: 1000000,
          files: 1000000,
          ffree: 1000000,
          favail: 1000000,
          fsid: 1000000,
          flag: 1000000,
          namemax: 1000000
        })
      }
    }
  }
}
