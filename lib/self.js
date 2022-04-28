const keyToName = require('./key-to-name')

// Peer-like object for ourself

module.exports = class Self {
  constructor (publicKey, rpc) {
    this.publicKey = publicKey
    this.rpc = rpc
    this.connection = true
    this.isMe = true // Not yet used
  }

  async getName () {
    this.name = this.name || await keyToName(Buffer.from(this.publicKey, 'hex'))
    return this.name
  }

  async readdir (path) {
    const { files } = await this.rpc.readdir({ path }).next()
    return files
  }

  async open (path) {
    const { fd } = await this.rpc.open({ path }, this.publicKey).next()
    return fd
  }

  async read (fd, len, pos) {
    return this.rpc.read({ fd, len, pos }, this.publicKey).next()
  }

  async close (fd) {
    return this.rpc.close({ fd }, this.publicKey).next()
  }

  async * find (basepath, searchterm) {
    for await (const { results } of this.rpc.find({ basepath, searchterm })) {
      yield results
    }
  }
}
