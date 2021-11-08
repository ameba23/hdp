const FuseNative = require('fuse-native')
const log = require('debug')('hdp')

module.exports = class Fuse {
  constructor (fs, options = {}) {
    this.fs = fs
    this.mountDir = options.mountDir
  }

  async mount () {
    const self = this
    this.handlers = this.handlers || this.createHandlers()
    this.fuse = this.fuse || new FuseNative(this.mountDir || './mnt', this.handlers, { autoCache: true })
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
    const fs = this.fs
    return {
      getattr (p, cb) {
        log('getattr(%s)', p)
        fs.stat(p)
          .then((stat) => {
            cb(0, stat)
          })
          .catch((err) => {
            cb(err.errno || Fuse.ENOENT)
          })
      },
      readdir (p, cb) {
        log('readdir', p)
        fs.readdir(p)
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
        fs.open(path)
          .then((fd) => { cb(0, fd) })
          .catch((err) => { cb(err.errno) })
      },
      read (path, fd, buf, len, pos, cb) {
        log('read', path, fd, len, pos, buf.length)
        fs.read(fd, buf, len, pos)
          .then(({ data, bytesRead }) => {
            console.log('bytesRead', bytesRead)
            cb(bytesRead)
          })
          .catch((err) => { cb(err.errno) })
      },
      release (path, fd, cb) {
        log('release', path, fd)
        fs.close((fd))
          .then(() => {
            cb(0)
          })
          .catch((err) => {
            cb(err.errno)
          })
      }
    }
  }
}