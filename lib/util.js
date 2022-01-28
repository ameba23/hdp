const { homedir } = require('os')
const { S_IFMT, S_IFDIR } = require('fs').constants

// Misc. helpers

function toString (bufOrString = '') {
  return typeof bufOrString === 'string' ? bufOrString : bufOrString.toString('hex')
}

module.exports = {
  toString,

  printKey (buf) {
    return toString(buf).slice(0, 4)
  },

  readableBytes (bytes) {
    if (bytes < 1) return 0 + ' B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + sizes[i]
  },

  createError (code, message) {
    const error = new Error(message)
    error.errno = code
    return error
  },

  resolveTilde (path) {
    if (path.startsWith('~/') || path === '~') {
      return path.replace('~', homedir())
    }
    return path
  },

  isDir (mode) {
    return (mode & S_IFMT) === S_IFDIR
  }
}
