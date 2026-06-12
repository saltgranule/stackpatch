# stackpatch



A lightweight open source web-based server panel for hosting game and application servers on Windows.



<img width="3000" height="1000" alt="1000x3000" src="https://github.com/user-attachments/assets/52018817-2a14-4328-b95a-9d4f6b328a8a" />


<img width="2556" height="1439" alt="1440p2" src="https://github.com/user-attachments/assets/85b6a782-4c70-417b-b3e4-d7421c7211b4" />




## why does stackpatch exist?

A lot of game servers and small applications run on spare hardware like old optiplex, or thinkpad laptops and desktops. Setting up Pterodactyl or a similar panel on that kind of hardware means installing Docker, configuring MySQL, overall just quite a lot of un-needed work. stackpatch is built for that gap. It runs directly on Windows without containers or external databases, uses a single SQLite file for persistence, and aims to stay small enough, to not burn any 3rd gen intel core i3 you plan to run it on.


## features
- Start, stop, restart, and terminate server instances
- Live console output with real-time log streaming
- Send commands directly to running processes
- Multiple instances running in parallel
- User management and instance access control
- Scheduled actions per instance
- Memory and CPU limiting per instance
- Works with Minecraft (Paper and others), Python apps, Java applications, and most processes that run from a command line

## prerequisites
Install these before running stackpatch:
Windows 10 or later.
Node.js 22.5 or later (https://nodejs.org/) - required by `start.bat` and nev scripts.



**Optional**
- **pnpm 9** — not required upfront; `start.bat` and `pnpm run start:prod` fetch `pnpm@9.15.9` automatically on first run. Install manually if you prefer: `npm install -g pnpm@9`
- **Runtimes for your instances** — e.g. Java 25 for Minecraft ([Temurin](https://adoptium.net/temurin/releases/?version=25)), Python, Node.js, depending on what you host. The panel does not install these for you.

**Before first start**
- Ensure ports **23333** (panel) and **24444** (daemon IPC) are free, or change them later in system settings.
- On Windows, use **`start.bat`** to launch the panel, which will build the panel UI, and installing any missing pre-requisites


## getting started
Clone the repo:
```bash
git clone https://github.com/saltgranule/stackpatch
cd stackpatch
```
**Recommended:** run **`start.bat`** on Windows. It builds the panel UI, installs any missing pre-requisites, and starts the panel (same as `pnpm run start:prod`).
Open [http://localhost:23333](http://localhost:23333) in your browser.
Default login: `admin` / `changeme` (change after first sign-in).


**Development (UI hot reload, Vite middleware):**
```bash
git clone https://github.com/saltgranule/stackpatch
cd stackpatch
pnpm install
pnpm run dev
```

## project structure
packages/

  ui/       React + Vite frontend
  api/      Fastify backend, REST and WebSocket
  daemon/   Node.js process manager, communicates via TCP IPC
  shared/   Types and protocol definitions shared across packages



## UI
area's of this panel's original design were heavily influenced by the TVA or Time Variance Authority entity from the Loki show on Disney plus.
components are often solid, borderless, with a retro, warm, pastel feel. 
Mobile support is around 80% done, though it is still very much in progress.
full light/darkmode themeing.

## use of AI (cursoragent)
aspects of claude were utilisied in late-stage development of this project, ensuring that the correct, and safest versions of dependencies were used. 
This is clarified here, and in the contributors insight tab.


## what's planned?
nothing to see here yet...



## configuration
Panel port `23333`  Open at `http://localhost:23333`, configurable via `system_settings`
Daemon IPC port `24444` Configurable via `system_settings` or env
Data directory `.data/` SQLite database and daemon heartbeat file + instances

## License
MIT License
