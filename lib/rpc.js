const fs = require('fs').promises
const { createReadStream } = require('fs')
const { join, normalize, sep, dirname } = require('path')
const { createError } = require('./util')
const { ENOENT, EHOSTUNREACH, ENOLCK } = require('./errors')
// const Cache = require('./cache')
const sublevel = require('subleveldown')
const log = require('debug')('hdp-rpc')

const MAX_RESULTS_PER_MESSAGE = 2 ** 9

// RPC - respond to remote requests for operations on the local filesystem
// TODO make it so the share dirs can be modified whilst running - addShare rmShare

module.exports = class Rpc {
  constructor (db, shares, emit) {
    this.shareNames = {}
    this.downloads = {}
    this.emit = emit
    this.db = sublevel(db, 'R', { valueEncoding: 'json' })
    this.dirSizes = sublevel(db, 'D', { valueEncoding: 'json' })
    this.addShares(shares).then(() => {
      emit('ready')
    })
  }

  async addShares (shares) {
    for (const share of shares) {
      if (share) await this.addShare(share)
    }
  }

  async addShare (shareRaw) {
    const share = normalize(shareRaw.trim())

    const shareArr = share.split('/').filter(s => s !== '')
    if (!shareArr.length) throw new Error('Cannot share root directory')
    const shareName = share.split('/').filter(s => s !== '').slice(-1)[0]
    // TODO this will clobber if the subdir has the same name
    this.shareNames[shareName] = share

    for await (const path of this._walk(share)) {
      const fullPath = join(share, path)
      const { size } = await fs.stat(fullPath)
      const shareNamePath = join(shareName, path)
      await this.db.put(shareNamePath, size)

      const dir = dirname(shareNamePath)
      const subdirs = dir.split('/')
      for (let i = 0; i <= subdirs.length; i++) {
        const subdir = i ? subdirs.slice(0, i).join('/') : '/'
        const existingDirSize = await this.dirSizes.get(subdir).catch(() => {})
        const updatedSize = (existingDirSize || 0) + size
        await this.dirSizes.put(subdir, updatedSize)
      }
    }

    // for await (const [filePath, size] of this.dirSizes.iterator()) {
    //   console.log('DIR', filePath, size)
    // }
  }

  async * _walk (baseDir) {
    if (baseDir[baseDir.length - 1] !== sep) baseDir = baseDir + sep
    yield * getFiles(baseDir)

    async function * getFiles (path) {
      const dirEntries = await fs.opendir(path)
      for await (const dirent of dirEntries) {
        const fullPath = join(path, dirent.name)
        if (dirent.isDirectory()) {
          yield * getFiles(fullPath)
        } else {
          yield fullPath.slice(baseDir.length)
        }
      }
    }
  }

  async * handleRequest (request, remotePk, connection) {
    const type = Object.keys(request)[0]
    if (!this[type]) throw new Error('Request has unknown type')
    yield * this[type](request[type], remotePk, connection)
  }

  async * ls ({ path = '', searchterm = '', recursive = false }, remotePk) {
    log('Got ls request from ', remotePk, path, searchterm, recursive)
    // TODO allow case sensitive search?
    // allow omitting search terms with minus sign prefix?
    if (path === '/') path = ''

    const lowerCaseSearchterm = searchterm.toLowerCase()

    const gte = path
    const lte = path + '~'
    let entries = []
    let noEntries = true

    for await (const [dirPath, size] of this.dirSizes.iterator({ gte, lte })) {
      yield * processEntry(dirPath, size, true)
    }

    for await (const [filePath, size] of this.db.iterator({ gte, lte })) {
      yield * processEntry(filePath, size, false)
    }

    async function * processEntry (filePath, size, isDir) {
      let relPath = filePath.slice(path.length)
      if (relPath.length > 1 && relPath[0] === '/') relPath = relPath.slice(1)
      if (!relPath) return
      if (relPath.toLowerCase().includes(lowerCaseSearchterm)) {
        if (recursive) {
          entries.push({ name: relPath, size, isDir })
        } else {
          const numberOfElements = filePath.split('/').length
          const basepathElements = path.length ? path.split('/').length : 0
          if (basepathElements + 1 === numberOfElements) {
            entries.push({ name: relPath, size, isDir })
          }
        }
        if (entries.length === MAX_RESULTS_PER_MESSAGE) {
          yield { entries }
          entries = []
          noEntries = false
        }
      }
    }
    if (entries.length || noEntries) yield { entries }
  }

  // TODO Check how many open files we already have
  // if too many, queue the file
  // on closing a file, check the queue
  async * read ({ path, start, end }, remotePk, connection) {
    if (end === 0) end = undefined
    const index = path + remotePk
    if (this.downloads[index]) throw createError(ENOLCK)
    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) throw createError(ENOENT)
    const fullPath = this._resolvePath(pathArr)
    // TODO is this stat needed?
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) throw createError(ENOENT)

    const rs = createReadStream(fullPath, { start, end })
    rs.on('error', (err) => { throw err }) // TODO improve
    this.downloads[index] = rs
    for await (const data of rs) {
      console.log('Buffered:', connection._readableState.buffered)
      yield { data }
    }
    delete this.downloads[index]
  }

  async closeAll () {
    for (const readStream of Object.values(this.downloads)) {
      readStream.destroy(createError(EHOSTUNREACH))
    }
  }

  _resolvePath (path) {
    const shareDir = this.shareNames[path[0]]
    if (!shareDir) throw createError(ENOENT)
    // TODO a more descriptive error: .. not allowed
    if (path.includes('..')) throw createError(ENOENT)
    const absPath = join(shareDir, path.slice(1).join('/'))
    // TODO Check that the path resolves to a subdir of the share
    // if (/^\.\.(\/|$)/.test(relative(shareDir, absPath))) throw createError(ENOENT) // && !isAbsolue(relative)
    return absPath
  }
}
