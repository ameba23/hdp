const Hdp = require('..')
const { describe } = require('tape-plus')
const { join, resolve } = require('path')
const tmp = require('tmp')

describe('basic', (context) => {
  let aliceStorageDir, bobStorageDir

  context.beforeEach(assert => {
    aliceStorageDir = tmp.dirSync({ unsafeCleanup: true })
    bobStorageDir = tmp.dirSync({ unsafeCleanup: true })
  })

  context.afterEach(assert => {
  })

  context('basic', async (assert) => {
    const alice = Hdp({
      storage: aliceStorageDir.name,
      shares: [resolvePath('./alice-files')]
    })
    const bob = Hdp({
      storage: bobStorageDir.name,
      shares: [resolvePath('./bob-files')]
    })

    await Promise.all([(resolve, reject) => {
      alice.once('ready', resolve)
    }, (resolve, reject) => {
      bob.once('ready', resolve)
    }])

    const swarmName = 'some place'
    alice.swarms.join(swarmName)
    bob.swarms.join(swarmName)

    await new Promise((resolve, reject) => {
      alice.once('connection', resolve)
    })

    await basicTest(alice, bob)
    // await basicTest(bob, alice)

    // await hdp1.leave(swarmName)
    // await hdp2.leave(swarmName)
    await Promise.all([
      alice.stop(true).catch(console.log),
      bob.stop(true).catch(console.log)
    ])

    async function basicTest (hdp1, hdp2) {
      for await (const result of hdp1.fs.ls('/', 'dme', true)) {
        console.log('r of ls', result)
      }
      // assert.equals(dirList.length, 1, 'One directory')
      //
      // const rsubdir = await hdp1.fs.readdir(dirList[0])
      // // console.log('rfiles', rfiles)
      // assert.equals(rsubdir.length, 1, 'One share directory')
      //
      // const subpath = `${dirList[0]}/${rsubdir[0]}`
      // const rfiles = await hdp1.fs.readdir(subpath)
      // // console.log('rfiles', rfiles)
      // assert.equals(rfiles.length, 1, 'One share directory')
      //
      // hdp1.fs.readdir('/not-a-peer').catch((err) => {
      //   assert.true(err, 'Should give error on reading non-existant directory')
      // })
      //
      // const filePath = `${subpath}/${rfiles[0]}`
      // const stat = await hdp1.fs.stat(filePath)
      // assert.true(typeof stat.size === 'number', 'Stat object has a size property')
      // assert.true(stat.size > 0, 'Size is > 0')
      //
      // hdp1.fs.stat(`${subpath}/not-a-file`).catch((err) => {
      //   assert.true(err.errno === -2, 'Correct err on stating a file which does not exist')
      // })
      //
      // const fd = await hdp1.fs.open(filePath)
      // assert.true(typeof fd === 'number', 'File descriptor returned')
      // assert.false(isNaN(fd), 'File desciptor is a number')
      //
      // const { data } = await hdp1.fs.read(fd, undefined, 10, 0)
      // assert.true(Buffer.isBuffer(data), 'File read correctly')
      // assert.true(data.length === 10, 'Correct number of bytes read')
      //
      // await hdp1.fs.readdir(`${subpath}/../`).catch((err) => {
      //   assert.equals(err.errno, -2, 'Should give error on attempting read outside share dir')
      // })
      //
      // await hdp1.fs.close(fd)
    }
  })
})

function resolvePath (path) {
  return join(resolve(__dirname), path)
}
