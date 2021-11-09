const Hdp = require('..')
const { describe } = require('tape-plus')
const { join, resolve } = require('path')

describe('basic', (context) => {
  context.beforeEach(assert => {
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {
    const hdp1 = Hdp({ shares: [resolvePath('./alice-files')] })
    const hdp2 = Hdp({ shares: [resolvePath('./bob-files')] })

    const swarmName = 'some place'

    hdp1.join(swarmName)
    hdp2.join(swarmName)

    await new Promise((resolve, reject) => {
      hdp1.once('connection', resolve)
    })

    const dirList = await hdp1.fs.readdir('/')
    assert.equals(dirList.length, 1, 'One directory')

    const rsubdir = await hdp1.fs.readdir(dirList[0])
    // console.log('rfiles', rfiles)
    assert.equals(rsubdir.length, 1, 'One share directory')

    const subpath = `${dirList[0]}/${rsubdir[0]}`
    const rfiles = await hdp1.fs.readdir(subpath)
    // console.log('rfiles', rfiles)
    assert.equals(rfiles.length, 1, 'One share directory')

    hdp1.fs.readdir('/not-a-peer').catch((err) => {
      assert.true(err, 'Should give error on reading non-existant directory')
    })

    const filePath = `${subpath}/${rfiles[0]}`
    const stat = await hdp1.fs.stat(filePath)
    assert.true(typeof stat.size === 'number', 'Stat object has a size property')
    assert.true(stat.size > 0, 'Size is > 0')

    hdp1.fs.stat(`${subpath}/not-a-file`).catch((err) => {
      assert.true(err.errno === -2, 'Correct err on stating a file which does not exist')
    })

    console.log(filePath)
    const fd = await hdp1.fs.open(filePath)
    assert.true(typeof fd === 'number', 'File descriptor returned')
    assert.true(fd > 0, 'File descriptor > 0')

    const { data, bytesRead } = await hdp1.fs.read(fd, undefined, 10, 0)
    assert.true(Buffer.isBuffer(data), 'File read correctly')
    assert.true(bytesRead === 10, 'Correct number of bytes read')

    await hdp1.fs.close(fd)

    // await hdp1.leave(swarmName)
    // await hdp2.leave(swarmName)
    await Promise.all([
      hdp1.hyperswarm.destroy().catch(console.log),
      hdp2.hyperswarm.destroy().catch(console.log)
    ])
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
