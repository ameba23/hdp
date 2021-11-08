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
    const files = await hdp1.readdir('/')
    // console.log(files)
    assert.equals(files.length, 1, 'One directory')
    const rfiles = await hdp1.readdir(files[0])
    // console.log('rfiles', rfiles)
    assert.equals(rfiles.length, 1, 'One file')

    hdp1.readdir('/not-a-peer').catch((err) => {
      assert.true(err, 'Should give error on reading non-existant directory')
    })

    const stat = await hdp1.stat(`${files[0]}/${rfiles[0]}`)
    assert.true(typeof stat.size === 'number', 'Stat object has a size property')

    hdp1.stat(`${files[0]}/not-a-file`).catch((err) => {
      assert.true(err.errno === -2, 'Correct err on stating a file which does not exist')
    })

    const fd = await hdp1.open(`${files[0]}/${rfiles[0]}`)
    assert.true(typeof fd === 'number', 'File descriptor returned')
    assert.true(fd > 0, 'File descriptor > 0')

    const { data, bytesRead } = await hdp1.read(fd, undefined, 10, 0)
    console.log(data, bytesRead)
    // assert.equal(data, '', 'File read correctly')

    await hdp1.close(fd)

    await hdp1.hyperswarm.destroy()
    await hdp2.hyperswarm.destroy()
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
