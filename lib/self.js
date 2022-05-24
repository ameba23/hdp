const keyToName = require('./key-to-name')

// Peer-like object for ourself

module.exports = class Self {
  constructor (publicKey, rpc) {
    this.publicKey = publicKey
    this.rpc = rpc
    this.connection = true
    this.isMe = true
  }

  async getName () {
    this.name = this.name || await keyToName(Buffer.from(this.publicKey, 'hex'))
    return this.name
  }

  async * ls (path, searchterm, recursive) {
    for await (const { entries } of this.rpc.ls({ path, searchterm, recursive }, this.publicKey)) {
      yield entries
    }
  }

  async * read (path, start, end) {
    for await (const output of this.rpc.read({ path, start, end }, this.publicKey)) {
      yield output
    }
  }
}
