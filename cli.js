#!/usr/bin/env node
const Hdp = require('.')
const argv = require('minimist')(process.argv.slice(2))

const hdp = Hdp(argv)
hdp.fuse.mount()
if (argv.join) hdp.join(argv.join)
