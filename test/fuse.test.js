const Hdp = require('..')
const { describe } = require('tape-plus')
const { join, resolve } = require('path')
const fs = require('fs').promises

describe('fuse', (context) => {
  context.beforeEach(assert => {
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {
    const hdp1 = Hdp({ shares: [resolvePath('./alice-files')], mountDir: resolvePath('./alice-mnt') })
    const hdp2 = Hdp({ shares: [resolvePath('./bob-files')], mountDir: resolvePath('./bob-mnt') })

    const swarmName = 'some place'

    hdp1.join(swarmName)
    hdp2.join(swarmName)

    await new Promise((resolve, reject) => {
      hdp1.once('connection', resolve)
    })

    await hdp1.fuse.mount()
    await hdp2.fuse.mount()

    const dirList = await fs.readdir(hdp1.fuse.mountDir)
    assert.equals(dirList.length, 1, 'One directory')

    const rsubdir = await fs.readdir(join(hdp1.fuse.mountDir, dirList[0]))
    assert.equals(rsubdir.length, 1, 'One share directory')

    const subpath = join(hdp1.fuse.mountDir, dirList[0], rsubdir[0])
    const rfiles = await fs.readdir(subpath)
    // console.log('rfiles', rfiles)
    assert.equals(rfiles.length, 1, 'One share directory')

    fs.readdir(join(hdp1.fuse.mountDir, 'not-a-peer')).catch((err) => {
      assert.true(err, 'Should give error on reading non-existant directory')
    })

    const filePath = join(subpath, rfiles[0])
    const stat = await fs.stat(filePath)
    assert.true(typeof stat.size === 'number', 'Stat object has a size property')
    assert.true(stat.size > 0, 'Size is > 0')

    const fh = await fs.open(filePath)
    assert.true(fh.fd > 0, 'File descriptor > 0')

    const data = Buffer.alloc(10)
    const { bytesRead } = await fh.read(data, 0, 10, 0)
    assert.true(bytesRead === 10, 'Correct number of bytes read')

    // await hdp1.fs.readdir(`${subpath}/../`).catch((err) => {
    //   assert.equals(err.errno, -2, 'Should give error on attempting read outside share dir')
    // })

    await fh.close()

    console.log('stating a file which does not exist...')
    fs.stat(join(subpath, 'not-a-file')).catch((err) => {
      console.log(err)
      assert.true(err.errno === -2, 'Correct err on stating a file which does not exist')
    })

    await Promise.all([
      hdp1.stop(true).catch(console.log),
      hdp2.stop(true).catch(console.log)
    ])
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
