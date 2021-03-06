const fs = require('fs').promises
const { createReadStream } = require('fs')
const { join, normalize, sep, dirname } = require('path')
const { createError } = require('./util')
const { ENOENT, EHOSTUNREACH, ENOLCK } = require('./errors')
const { randomId } = require('./crypto')
// const Cache = require('./cache')
const sublevel = require('subleveldown')
const speedometer = require('speedometer')
const log = require('debug')('hdp-rpc')

const MAX_RESULTS_PER_MESSAGE = 2 ** 9
const MAX_BUFFER_SIZE = 2 ** 20
const BUFFER_WAIT_TIME = 5

// RPC - respond to remote requests for operations on the local filesystem

module.exports = class Rpc {
  constructor (db, shares, emit) {
    this.shareNames = {}
    this.uploads = {}
    this.emit = emit
    this.db = sublevel(db, 'R', { valueEncoding: 'json' })
    this.dirSizes = sublevel(db, 'D', { valueEncoding: 'json' })
    this.addShares(shares).then(() => {
      emit('ready')
    })
  }

  async * handleRequest (request, remotePk, connection, name) {
    const type = Object.keys(request)[0]
    if (!this[type]) throw new Error('Request has unknown type')
    yield * this[type](request[type], remotePk, connection, name)
  }

  async addShares (shares) {
    log('Adding shares...')
    // Delete the existing db. TODO improve
    await this.db.clear()
    await this.dirSizes.clear()
    for (const share of shares) {
      if (share) await this.addShare(share)
    }
    log('Shares added.')
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

    for await (const [filePath, size] of this.dirSizes.iterator()) {
      console.log('DIR', filePath, size)
    }
  }

  // TODO async rmShare(shareRaw)

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
  async * read ({ path, start = 0, end }, remotePk, connection, peerName) {
    log(`Uploading file ${path} ${start} ${end} to ${peerName}`)
    if (end === 0) end = undefined
    const index = path + remotePk
    if (this.uploads[index]) throw createError(ENOLCK)
    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) throw createError(ENOENT)
    const fullPath = this._resolvePathArr(pathArr)
    // TODO is this stat needed?
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) throw createError(ENOENT)

    const rs = createReadStream(fullPath, { start, end })
    rs.on('error', (err) => { throw err }) // TODO improve
    this.uploads[index] = rs
    let bytesRead = start
    const id = randomId()
    const speed = speedometer()
    const startTime = Date.now()
    for await (const data of rs) {
      yield { data }
      bytesRead += data.length
      const kbps = parseInt(speed(data.length) * 0.008)

      log(`Upload ${path} bytes read: ${bytesRead} Buffered: ${connection._writableState.buffered} Speed: ${kbps}`)
      this.emit('success', id, 'upload', { filePath: path, bytesRead, peerName })

      while (connection._writableState.buffered > MAX_BUFFER_SIZE) {
        await new Promise((resolve) => { setTimeout(resolve, BUFFER_WAIT_TIME) })
      }
    }
    const timetaken = Date.now() - startTime
    const overallspeed = parseInt(((bytesRead - start) / timetaken) * 0.008)
    log(`Upload ${path} Complete. Average speed: ${overallspeed} kbps`)
    this.emit('endResponse', id)
    delete this.uploads[index]
  }

  async closeAll () {
    for (const readStream of Object.values(this.uploads)) {
      readStream.destroy(createError(EHOSTUNREACH))
    }
  }

  resolvePath (path) {
    const pathArr = path.split('/').filter(p => p !== '')
    return this._resolvePathArr(pathArr)
  }

  _resolvePathArr (path) {
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
