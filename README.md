# stackpatch

A lightweight open source web-based server panel for hosting game and application servers on Windows, with Linux support coming.

## Why does stackpatch exist?

Most self-hosted server panels are built around Linux, Docker, and a full database stack. That makes sense for cloud infrastructure, but it's more than most people need.

A lot of game servers and small applications run on spare hardware, an old desktop, a repurposed laptop, you get it. Setting up Pterodactyl or a similar panel on that kind of hardware means installing Docker, configuring MySQL, and setting up a stack that's just not needed.

stackpatch is built for that gap. It runs directly on Windows without containers or external databases, uses a single SQLite file for persistence, and aims to stay small enough that it doesn't become the thing you're maintaining instead of the servers you actually care about.

---

## Features

- Start, stop, restart, and terminate server instances
- Live console output with real-time log streaming
- Send commands directly to running processes
- Multiple instances running in parallel
- User management and instance access control
- Scheduled actions per instance
- Works with Minecraft (Paper and others), Python apps, Java applications, and most processes that run from a command line

---

## Requirements

- Windows 10 or later (Linux support planned)
- Node.js 20 or later
- pnpm (installed on run of start.bat)

---

## Getting started

```bash
git clone https://github.com/saltgranule/stackpatch
cd stackpatch
pnpm install
pnpm run dev
```

Or run `start.bat`, which handles everything and should work out of the box.

Open `http://localhost:23333` in your browser.

---

## Project structure

```
packages/
  ui/       React + Vite frontend
  api/      Fastify backend, REST and WebSocket
  daemon/   Node.js process manager, communicates via TCP IPC
  shared/   Types and protocol definitions shared across packages
```

---

## Configuration

| Setting | Default | Notes |
|---|---|---|
| Panel port | `23333` | Configurable via `system_settings` |
| Daemon IPC port | `24444` | Configurable via `system_settings` or env |
| Data directory | `.data/` | SQLite database and daemon heartbeat file + instances |

---

## Contributing

Pull requests are welcome. stackpatch uses pnpm workspaces — shared types live in `@stackpatch/shared` and are consumed by both the API and daemon, so protocol changes should start there.

Existing tests are in `packages/api`. If you want to add coverage, the most useful area is the daemon reconnection and process lifecycle paths, that's where the least coverage exists today.

To build all packages:

```bash
pnpm -r run build
```

---

## License

MIT