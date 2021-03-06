const speedometer = require('speedometer')
const sublevel = require('subleveldown')
const fs = require('fs')
const { join, dirname } = require('path')
const mkdirp = require('mkdirp')
const { createError, combineIterators } = require('./util')
const { ENOENT } = require('./errors')
const Wishlist = require('./wishlist')
const { randomId } = require('./crypto')
const log = require('debug')('hdp-fs')

module.exports = class Fs {
  constructor (storage, db, emit) {
    this.peerNames = {}
    this.wishlist = new Wishlist(db)
    this.downloadDb = sublevel(db, 'DL', { valueEncoding: 'json' })
    this.downloadDir = join(storage, 'downloads')
    this.emit = emit
  }

  // TODO are we using omitSelf and omitOthers?
  async * ls (path = '', searchterm = '', recursive, omitSelf, omitOthers) {
    const self = this
    const pathArr = path.split('/').filter(p => p !== '')
    const peerNames = this._connectedPeerNames().filter((name) => {
      if (omitSelf) return !self.peerNames[name].isMe
      if (omitOthers) return self.peerNames[name].isMe
      return true
    })

    if (!pathArr.length && !recursive) {
      const peerRootEntries = []
      for (const name of peerNames) {
        let totalSize = 0
        for await (const results of this.peerNames[name].ls('/')) {
          for (const entry of results) {
            totalSize += entry.size
          }
        }
        peerRootEntries.push({
          name, isDir: true, size: totalSize
        })
      }
      yield peerRootEntries
      return
    }
    const peersToSearch = pathArr.length
      ? peerNames.includes(pathArr[0]) ? [pathArr[0]] : []
      : peerNames

    log(`Searching ${path} ${searchterm} ${peersToSearch}`)

    // Search all peers concurrently
    const iterators = peersToSearch.map((name) => {
      const pathToQuery = (pathArr[0] === name) ? pathArr.slice(1).join('/') : '/'
      return self.peerNames[name].ls(pathToQuery, searchterm, recursive)
    })

    for await (const [results, index] of combineIterators(iterators)) {
      yield results.map((entry) => {
        if (!pathArr.length) entry.name = join(peersToSearch[index], entry.name)
        return entry
      })
    }
  }

  async * read (pathString, start, end) {
    const path = pathString.split('/').filter(p => p !== '')
    if (!path.length) throw createError(ENOENT)
    if (!Object.keys(this.peerNames).includes(path[0])) throw createError(ENOENT)
    yield * this.peerNames[path[0]].read(path.slice(1).join('/'), start, end)
  }

  async * download (path, destination, offset) {
    // TODO check path points to a peer
    // Check if we already have an active dl from this peer
    const next = await this.wishlist.nextItem(path.split('/')[0])
    const wishlistIndex = await this.wishlist.add(path)
    // const peer = this._peerFromPath(path)
    if (!next) {
      yield * this._download(path, destination, offset, wishlistIndex)
    }
  }

  async addPeer (peer) {
    const name = await peer.getName()
    // const alreadyKnown = !!this.peerNames[name]
    this.peerNames[name] = peer

    // if (!alreadyKnown) {
    // If we want something from this peer, ask for it
    const next = await this.wishlist.nextItem(name)
    if (next) {
      const iterator = this._download(next.path, undefined, undefined, next.index)
      this._consumeIterator(iterator, 'download')
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

  async * _download (path, destination, offset, wishlistIndex) {
    destination = destination || this.downloadDir
    const self = this
    let totalBytesRead = 0
    yield * doDownload(path, destination, offset)
    log('Dl finish, removing item from wishlist')
    await this.wishlist.remove(wishlistIndex)

    // Start downloading the next item from this peer
    const peerName = await this._peerFromPath(path).getName()
    const next = await this.wishlist.nextItem(peerName)
    log(`Checking wishlist for items from ${peerName} ${next}`)
    if (next) {
      const iterator = this._download(next.path, undefined, undefined, next.index)
      this._consumeIterator(iterator, 'download')
    }

    async function * doDownload (path, destination, offset) {
      log('Checking if file is dir or file')
      let noFilesFound = true
      for await (const entries of self.ls(path, '', true)) {
        if (noFilesFound && entries.length) noFilesFound = false
        log('Entries', entries)
        // TODO create subdirs on target
        for (const file of entries) {
          if (file.isDir) continue
          const filePath = join(path, file.name)
          yield * downloadFile(filePath, join(destination, filePath))
        }
      }
      if (noFilesFound) {
        console.log('looks like a file')
        // Assume the given path is a file rather than a dir
        yield * downloadFile(path, join(destination, path), offset)
      }
    }

    async function * downloadFile (filePath, destination, offset) {
      log(`Downloading file ${filePath} to ${dirname(destination)}`)
      // TODO maybe move this to avoid unnessary calls to mkdirp
      // TODO handle the case that there exists a file with the same name as
      // the directory
      await mkdirp(dirname(destination))

      // TODO .part suffix - destination + '.part'
      // TODO { start: offset } ? or ditch offset altogether
      let start
      try {
        const stat = await fs.promises.stat(destination)
        start = stat.size
      } catch (err) {
        start = 0
      }
      const flags = start ? 'r+' : 'w'
      const writeStream = fs.createWriteStream(destination, { flags, start })
      writeStream.on('error', (err) => {
        throw err
      })

      let bytesRead = start
      totalBytesRead += start
      const speed = speedometer()
      for await (const { data } of self.read(filePath, start)) {
        totalBytesRead += data.length
        bytesRead += data.length
        const kbps = parseInt(speed(data.length) * 0.008)
        log(`Download speed: ${kbps}`)
        writeStream.write(data)
        yield { bytesRead, filePath, totalBytesRead, kbps }
      }
      const timestamp = Date.now()
      await self.downloadDb.put(timestamp, {
        localPath: destination,
        filePath,
        size: bytesRead
      })

      const id = randomId()
      self.emit('success', id, 'downloaded', {
        downloadedFiles: [{
          localPath: destination,
          filePath,
          timestamp,
          size: bytesRead
        }]
      })

      // TODO await fs.promises.rename(destination + '.part', destination)
    }
  }

  async getDownloadedList () {
    const list = []
    for await (const [timestamp, downloadedFile] of this.downloadDb.iterator({ limit: 100, reverse: true })) {
      list.push(Object.assign(downloadedFile, { timestamp }))
    }
    return list
  }

  _connectedPeerNames () {
    const self = this
    return Object.keys(this.peerNames).filter((name) => {
      return !self.peerNames[name].connection.destroyed
    })
  }

  async _consumeIterator (iterator, messageType) {
    const id = randomId()
    try {
      for await (const output of iterator) {
        this.emit('success', id, messageType, output)
      }
      this.emit('endResponse', id)
    } catch (err) {
      console.log('Got err', err)
      this.emit('error', id, err)
    }
  }
}
