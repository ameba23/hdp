const Rpc = require('../lib/rpc')
const { describe } = require('tape-plus')
const { join, resolve } = require('path')
const level = require('level')
const tmp = require('tmp')

describe('basic', (context) => {
  let storageDir

  context.beforeEach(assert => {
    storageDir = tmp.dirSync({ unsafeCleanup: true })
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {
    const db = level(storageDir.name)
    const rpc = new Rpc(db)
    await rpc.addShare(resolvePath('./alice-files'))
    for await (const [k, v] of rpc.db.iterator()) {
      console.log(k, v)
    }
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
