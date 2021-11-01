#!/usr/bin/env node
const Fuse = require('fuse-native')
const fs = require('fs')
const { join } = require('path')
const log = console.log

const basepath = './test'

const uid = process.getuid()
const gid = process.getgid()

function createStatObject(size, atime, mtime, ctime) {
 // new Date(atime)
  // dev is id of device - should this be 0 or the current device
  return {
    dev: 0,
    nlink: 1, // number of hard links
    mtime,
    atime,
    ctime,
    size,
    uid,
    gid
  }
}

const handlers = {
  getattr (p, cb) {
    log('getattr(%s)', p)
    fs.stat(join(basepath, p), (err, stat) => {
      if (err) return cb(err.errno || Fuse.ENOENT)
      cb(0, stat)
    })
  },
  readdir (p, cb) {
    log('readdir', p)
    fs.readdir(join(basepath, p), (err, files) => {
      if (err) return cb(err.errno || Fuse.ENOENT)
      cb(0, files)
    })
  },
  open (path, flags, cb) {
    log('open', path, flags)
    fs.open(join(basepath, path), flags, (err, fd) => {
      console.log(err, fd)
      if (err) return cb(err.errno)
      cb(0, fd)
    })
  },
  read (path, fd, buf, len, pos, cib) {
    log('read', path, fd, len, pos, buf.length)
    fs.read(fd, buf, 0, len, pos, (err, bytesRead) => {
      if (err) return cib(err.errno)
      console.log(err, bytesRead, buf.length, buf.toString())
      cib(bytesRead)
    })
  },
  release (path, fd, cb) {
    log('release', path, fd)
    fs.close(fd, (err) => {
      cb(err ? err.errno : 0)
    })
  }
}

const fuse = new Fuse(process.argv[2] || './mnt', handlers, { autoCache: true })

fuse.mount(function (err) {
  log(err)
  log('mounted ...')

  process.once('SIGINT', function () {
    fuse.unmount(function (err) {
      log('unmounted', err)
      process.exit()
    })
  })
})
