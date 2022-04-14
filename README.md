# harddrive party

This allows two or more peers to share files. Peers choose one or more directories to share, and a swarm 'topic' name to meet at. 

The [wire protocol](./lib/schema.proto) is largely inspired by [SFTP](https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer-02), but only allows read operations. File metadata is cached locally in memory but file content is not.

Peer discovery, [NOISE](https://noiseprotocol.org/) handshaking and stream encryption is done by [hyperswarm](https://github.com/hyperswarm/hyperswarm)

Design goals:
- Minimal setup - do not need to wait to hash files or build an index.
- Can be used with large media collections

## Usage

Requires node 14.

All options can be given either as command line options or in a TOML configuration file at `~/.hdp/config.toml`

- `shares` - one or more directories containing media to share 
- `join` - topic name to join - you will connect to peers who enter the same name

Example command line usage:

`./cli.js start --join someplace --shares '/home/me/media'`

Example configuration file:

```toml
shares = [
  "/home/me/music",
  "/home/me/film"
]
join = "someplace"
```

## Roadmap

- [x] LRU Cache
- [ ] Timeout

### Search
- [ ] Search peers concurrently
- [x] Stream large search results
- [ ] Cache index of own files ?
- [ ] Report directory sizes

### Shares
- [ ] report homedir to UI 
- [ ] Allow dynamic changing of share dirs
- [ ] Automatically share download dir

### Transfers
- [x] Local download
- [ ] Default download directory option
- [ ] Remote queueing
- [x] Local queueing
- [x] Graceful restart download on reconnect / restart
- [x] Recursive directory download
- [ ] Report uploads to UI

### Swarming
- [x] Capability verification 
- [ ] Avoid joining swarms already joined?
- [ ] Correctly report joined swarms on startup
- [ ] Serve files available locally over http
