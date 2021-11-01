const Hdp = require('..')
const { describe } = require('tape-plus')
const { join, resolve } = require('path')

describe('basic', (context) => {

  context.beforeEach(assert => {
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {

    hdp1 = Hdp({ shares: [resolvePath('./alice-files')] })
    hdp2 = Hdp({ shares: [resolvePath('./bob-files')] })

    await hdp1.connect('hello world')
    await new Promise((resolve, reject) => {
      setTimeout(resolve, 500)
    })
    await hdp2.connect('hello world')
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
