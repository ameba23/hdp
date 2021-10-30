#!/usr/bin/env node
const Fuse = require('fuse-native')
const fs = require('fs')
const path = require('path')

const basepath = './test'

const handlers = {
  getattr: function (p, cb) {
    console.log('getattr(%s)', p)
    fs.stat(path.join(basepath, p), (err, stat) => {
      console.log(err)
      if (err) return cb(err.errno || Fuse.ENOENT)
      cb(0, stat)
    })
  },
  readdir: function (p, cb) {
    console.log('readdir', p)
    fs.readdir(path.join(basepath, p), (err, files) => {
      if (err) return cb(err.errno || Fuse.ENOENT)
      cb(0, files)
    })
  }
}

const f = new Fuse(process.argv[2] || './mnt', handlers, { autoCache: true })

f.mount(function (err) {
  console.log(err)
  console.log('mounted ...')

  process.once('SIGINT', function () {
    f.unmount(function (err) {
      console.log('unmounted', err)
      process.exit()
    })
  })
})
