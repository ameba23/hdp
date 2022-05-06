const fs = require('fs').promises
const { createReadStream } = require('fs')
const { join, normalize, sep, dirname } = require('path')
const { createError, isDir } = require('./util')
// const walk = require('./fs-walk')
const { ENOENT, EBADF } = require('./errors')
const Cache = require('./cache')
const sublevel = require('subleveldown')

const MAX_RESULTS_PER_MESSAGE = 2 ** 9

// RPC - respond to remote requests for operations on the local filesystem
// TODO make it so the share dirs can be modified whilst running - addShare rmShare

module.exports = class Rpc {
  constructor (db, emit) {
    this.shareNames = {}
    this.fileDescriptors = {}
    this.emit = emit
    this.db = sublevel(db, 'R', { valueEncoding: 'json' })
    this.dirSizes = sublevel(db, 'D', { valueEncoding: 'json' })
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
      await this.db.put(join(shareName, path), size)
    }

    for await (const [filePath, size] of this.db.iterator()) {
      const dir = dirname(filePath)
      const subdirs = dir.split('/')
      for (let i = 1; i <= subdirs.length; i++) {
        const subdir = subdirs.slice(0, i).join('/')
        const existingDirSize = await this.dirSizes.get(subdir).catch(() => {})
        const updatedSize = (existingDirSize || 0) + size
        await this.dirSizes.put(subdir, updatedSize)
      }
    }

    for await (const [filePath, size] of this.dirSizes.iterator()) {
      console.log('DIR', filePath, size)
    }
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

  async * handleRequest (request, remotePk) {
    const type = Object.keys(request)[0]
    if (!this[type]) throw new Error('Request has unknown type')
    yield * this[type](request[type], remotePk)
  }

  async * readdir ({ path }) {
    let files = this.readdirCache.get(path)
    if (!files) {
      const pathArr = path.split('/').filter(p => p !== '')
      const dirEntries = pathArr.length
        ? await fs.opendir(this._resolvePath(pathArr))
        : Object.keys(this.shareNames).map((name) => {
          return { name, isDirectory: () => true }
        })
      files = []
      for await (const dirent of dirEntries) {
        if (dirent.isDirectory()) {
          files.push({
            name: dirent.name,
            mode: 16877,
            size: 4096 // TODO
          })
        } else {
          const stat = await fs.stat(this._resolvePath([...pathArr, dirent.name]))
          files.push({
            name: dirent.name,
            mode: stat.mode,
            size: stat.size
          })
        }
      }
      this.readdirCache.set(path, files)
    }
    yield { files }
  }

  async * find ({ basepath, searchterm = '', recursive = false }) {
    // TODO allow case sensitive search?
    // allow omitting search terms with minus sign prefix?

    const lowerCaseSearchterm = searchterm.toLowerCase()

    const pathArr = basepath.split('/').filter(p => p !== '')
    const basepaths = pathArr.length
      ? [basepath]
      : Object.keys(this.shareNames)

    let results = []
    for (const basepath of basepaths) {
      for await (const relPath of this._walk(basepath)) {
        // TODO decide if to include sharename in search
        if (relPath.toLowerCase().includes(lowerCaseSearchterm)) {
          results.push(join(basepath, relPath))
          if (results.length === MAX_RESULTS_PER_MESSAGE) {
            yield { results }
            results = []
          }
        }
      }
    }
    if (results.length) yield { results }
  }

  // TODO not yet used
  // Check how many open files we already have
  // if too many, queue the file
  // on closing a file, check the queue
  async * readStream ({ path, start, end }, remotePk) {
    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) {
      console.log('Opening directories not implemented')
      process.exit(1) // TEMP
    }

    const fullPath = this._resolvePath(pathArr)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) throw createError(ENOENT)

    const rs = createReadStream(this._resolvePath(pathArr), { start, end })
    for await (const data of rs) {
      yield { data }
    }
  }

  async * open ({ path }, remotePk) {
    // TODO max amount of concurrently open files?
    // this.fileDescriptors.filter(f => f.remotePk === remotePk)

    const pathArr = path.split('/').filter(p => p !== '')
    if (!pathArr.length) {
      console.log('Opening directories not implemented')
      process.exit(1) // TEMP
    }

    const fullPath = this._resolvePath(pathArr)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) throw createError(ENOENT)
    const fileHandle = await fs.open(this._resolvePath(pathArr))
    fileHandle.peer = remotePk
    this.fileDescriptors[fileHandle.fd] = fileHandle
    yield { fd: fileHandle.fd }
  }

  async * read ({ fd, len, pos }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    let data = Buffer.alloc(len)
    const { bytesRead } = await this.fileDescriptors[fd].read(data, 0, len, pos)
    if (bytesRead < len) data = data.slice(0, bytesRead)
    yield { data }
  }

  async * close ({ fd }, remotePk) {
    if (!this.fileDescriptors[fd]) throw createError(EBADF)
    // Check the fd belongs to this peer
    if (this.fileDescriptors[fd].peer !== remotePk) throw createError(EBADF)
    // TODO should we not await?
    await this.fileDescriptors[fd].close()
    yield {}
  }

  async closeAll () {
    for (const fileHandle of Object.values(this.fileDescriptors)) {
      await fileHandle.close()
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
