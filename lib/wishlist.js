const level = require('level')

// Wishlist / local queue for requested files
// this stores items chronologically on disk

module.exports = class Wishlist {
  constructor (storage) {
    this.db = level(storage, { keyEncoding: 'binary' })
  }

  // Add an item and return the lookup key used
  async add (path) {
    this.index = this.index || await this._getCurrentIndex()
    const b = Buffer.alloc(4)
    b.writeUInt32BE(this.index++)
    await this.db.put(b, path)
    return b
  }

  async remove (key) {
    await this.db.del(key)
  }

  async * createReadStream () {
    for await (const item of this.iterator()) {
      yield item[1]
    }
  }

  iterator () {
    return this.db.iterator({ keys: false })
  }

  // Next item for a given peer
  async nextItem (peer) {
    for await (const entry of this.db.iterator({ reverse: true, keys: false })) {
      if (entry[1].startsWith(peer)) {
        return entry[1]
      }
    }
  }

  async _getCurrentIndex () {
    const k = await this.db.iterator({ reverse: true, values: false }).next()
    return k ? k[0].readUInt32BE() : 0
  }
}
