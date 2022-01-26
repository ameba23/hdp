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

## TODO
- [x] Capability verification 
- [x] LRU Cache
- [ ] Local download
- [ ] Remote queueing
- [ ] Local queueing
- [ ] Graceful restart download on reconnect / restart
- [ ] Recursive directory download
- [ ] Timeout
- [ ] yargs
