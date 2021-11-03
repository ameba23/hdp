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


    await hdp1.join(swarmName)

    await new Promise((resolve, reject) => {
      setTimeout(resolve, 1000)
    })
    await hdp2.join(swarmName)
    // console.log(hdp1.hyperswarm)
    await new Promise((resolve, reject) => {
      hdp1.once('connection', resolve)
    })
    const files = await hdp1.readDir('/')
    // console.log(files)
    assert.equals(files.length, 1, 'One directory')
    const rfiles = await hdp1.readDir(files[0])
    // console.log('rfiles', rfiles)
    assert.equals(rfiles.length, 1, 'One file')

    hdp1.readDir('/not-a-peer').catch((err) => {
      assert.true(err, 'Should give error on reading non-existant directory')
    })

    const stat = await hdp1.stat(`${files[0]}/${rfiles[0]}`)
    console.log('output', stat)
    assert.true(typeof stat.size === 'number', 'Stat object has a size property')

    hdp1.stat(`${files[0]}/not-a-file`).catch((err) => {
      console.log('err', err)
      assert.true(err.errno === -2)
    })

    await hdp1.hyperswarm.destroy()
    await hdp2.hyperswarm.destroy()
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
