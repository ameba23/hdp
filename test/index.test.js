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
    assert.equals(files.length, 1, 'One directory')
    const rfiles = await hdp1.readDir(files[0])
    console.log('rfiles', rfiles)
    assert.equals(rfiles.length, 1, 'One file')
    const stat = await hdp1.stat(`${files[0]}/${rfiles[0]}`)
    console.log('output', stat)
    await hdp1.hyperswarm.destroy()
    await hdp2.hyperswarm.destroy()
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
