const Hdp = require('..')
const { describe } = require('tape-plus')

describe('basic', (context) => {

  context.beforeEach(assert => {
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {
    hdp1 = Hdp()
    hdp2 = Hdp()

    await hdp1.connect(Buffer.alloc(32).fill('hello world'))
    await hdp2.connect(Buffer.alloc(32).fill('hello world'))
  })
})
