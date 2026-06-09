# Contributing to stackpatch
stackpatch is MIT-licensed and open to contributions of all shapes and sizes, anything aiming to improve this project, is welcome.

## Getting started
1. Fork and clone the repository
2. Install [Node.js 22.5+](https://nodejs.org/) and [pnpm](https://pnpm.io/)
3. Run `pnpm install`
4. Run `pnpm --filter @stackpatch/shared build`
5. Run `pnpm dev` to start the development stack

## Project structure
- `packages/shared` — Shared TypeScript types and constants. Protocol changes between the API and daemon start here.
- `packages/api` — Fastify REST API, WebSocket server, and SQLite persistence
- `packages/daemon` — Node.js process manager, communicates with the API over local TCP
- `packages/ui` — React + Vite web panel

## Development workflow
1. Create a branch from `main`
2. Make focused changes with tests where appropriate
3. Run `pnpm typecheck` and `pnpm test` before opening a PR
4. Follow existing code style and naming conventions

Tests live in `packages/api`. The daemon reconnection and process lifecycle paths have the least coverage, we urgently need more coverage here, so feel free to submit

## Commit messages
clear:
- `add instance status polling to dashboard`
- `fix path traversal check in file manager`

## Pull requests
- Keep PRs focused on a single concern
- Reference related issues when applicable
- Include a brief description of how you tested the change