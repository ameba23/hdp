#!/usr/bin/env node
const Hdp = require('.')
const argv = require('minimist')(process.argv.slice(2))

const hdp = Hdp(argv)
if (argv.mount) hdp.fuse.mount()
if (argv.join) hdp.join(argv.join)
