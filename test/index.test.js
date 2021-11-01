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

    const swarmName = 'some place'

    await hdp1.connect(swarmName)
    await new Promise((resolve, reject) => {
      setTimeout(resolve, 500)
    })
    await hdp2.connect(swarmName)
    await new Promise((resolve, reject) => {
      hdp1.on('connection', () => {
        resolve()
      })
    })
    const files = await hdp1.readDir('/')
    console.log(files)
    const rfiles = await hdp1.readDir(files[0])
    console.log('rfiles', rfiles)
    await hdp1.hyperswarm.destroy()
    await hdp2.hyperswarm.destroy()
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
