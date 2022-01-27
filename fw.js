const walk = require('./lib/fs-walk')

async function main () {
  for await (const f of walk(process.argv[2])) {
    if (f.includes(process.argv[3])) console.log(f)
  }
}

main()
