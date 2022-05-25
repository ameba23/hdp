const { homedir } = require('os')

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

  // For concurrently running async iterators
  async * combineIterators (iterable) {
    const asyncIterators = Array.from(iterable, o => o[Symbol.asyncIterator]())
    const results = []
    let count = asyncIterators.length
    const never = new Promise(() => {})
    function getNext (asyncIterator, index) {
      return asyncIterator.next().then(result => ({
        index,
        result
      }))
    }
    const nextPromises = asyncIterators.map(getNext)
    try {
      while (count) {
        const { index, result } = await Promise.race(nextPromises)
        if (result.done) {
          nextPromises[index] = never
          results[index] = result.value
          count--
        } else {
          nextPromises[index] = getNext(asyncIterators[index], index)
          yield [result.value, index]
        }
      }
    } finally {
      for (const [index, iterator] of asyncIterators.entries()) {
        if (nextPromises[index] !== never && iterator.return != null) {
          iterator.return()
          // no await here - see https://github.com/tc39/proposal-async-iteration/issues/126
        }
      }
    }
    return results
  }
}
