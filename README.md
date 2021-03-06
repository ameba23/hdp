# harddrive party

This allows two or more peers to share files. Peers can choose directories to share, and a swarm 'topic' name to meet at. 

Peer discovery, [NOISE](https://noiseprotocol.org/) handshaking and stream encryption is done by [hyperswarm](https://github.com/hyperswarm/hyperswarm).

Remote file metadata is cached locally in memory.

Design goals:
- Minimal setup - do not need to wait to hash files for the index.
- Can be used with large media collections
- Remote control via ws / http interface. Can be run on an ARM device or NAS and controlled from another computer.

## Protocol

The [wire protocol](./lib/schema.proto) consists of request / response messages of 3 main types:

- A `handshake` message at the beginning of each connection.
- `ls` messages which query the remote file system for filenames.
- `read` messages which read a file, or a portion of a file.

All messages have a 32 bit `id` and related messages share the same id.

There is also an `endResponse` signal which indicates that no more related messages with a particular id will be sent.

## Usage

Requires node >= 14. Tested with 14.17.5

All options can be given either as command line options, specified in a TOML configuration file at `~/.hdp/config.toml`, or set with the web interface.

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
- [x] Search peers concurrently
- [x] Stream large search results
- [x] Cache index of own files
- [x] Report directory sizes

### Shares
- [ ] report homedir to UI 
- [ ] report full local path to UI
- [ ] Allow runtime adding/removing of share dirs
- [ ] Automatically share download dir
- [ ] Mechanism to update changes in share dirs
- [x] Serve shared files over http

### Transfers
- [x] Local download
- [wip] Remote queueing
- [x] Local queueing
- [x] Graceful restart download on reconnect / restart
- [x] Recursive directory download
- [x] Report uploads to UI
- [x] Persistent representation of downloaded files (db)
- [x] Serve downloaded files over http

### Swarming
- [x] Capability verification 
- [x] Avoid joining swarms already joined?
- [x] Correctly report joined swarms on startup
