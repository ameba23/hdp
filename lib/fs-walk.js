const fs = require('fs').promises
const path = require('path')

// A filesystem walk designed to favour saving memory over speed
// (designed for large directories)

// TODO currently will not follow symbolic links
// if (file.isSymbolicLink()) {
//   fs.stat(fullPath, (err, stats) => {
//     if (err) return cb(err)
//     if (stats.isDirectory()) return cb(null, fullPath)
//   })
// }

module.exports = async function * (baseDir) {
  if (baseDir[baseDir.length - 1] !== path.sep) baseDir = baseDir + path.sep
  yield * getFiles(baseDir)

  async function * getFiles (directory) {
    const files = await fs.readdir(directory, { withFileTypes: true })

    for await (const f of files) {
      const fullPath = path.join(directory, f.name)
      if (f.isFile()) yield fullPath.slice(baseDir.length)
      if (f.isDirectory()) yield * getFiles(fullPath)
    }
  }
}
