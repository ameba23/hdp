const MAX_CACHE_SIZE = 50000

module.exports = class Cache {
  constructor () {
    this.items = {}
  }

  get (key) {
    const value = this.items[key]
    if (!value) return
    delete this.items[key]
    this.items[key] = value
    return value
  }

  set (key, value) {
    this.items[key] = value
    if (Object.keys(this.items).length > MAX_CACHE_SIZE) {
      delete this.items[Object.keys(this.items)[0]]
    }
  }
}
