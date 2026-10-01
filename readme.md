# Joyfrimens

A pharmacy workspace for tracking cash sales, drug prices, and stock across two shops and shared main storage.

**Status: Sprint 1 foundation.** This is a working frontend/backend skeleton and development preview. It does not yet record sales, authenticate staff, store inventory, or work offline. Do not use it for real business transactions yet.

## Intended workflow

- Find approved drug prices by name, strength, and selling unit.
- Record cash-only sales against the selected shop and actual shelf/storeroom source.
- Track shared main storage supplying both shops through recorded transfers.
- Count one cash drawer while sales continue in another; reconcile each separately.
- Audit price changes by admins and specifically authorized employees.
- Save sales locally during outages and synchronize without duplicate transactions.
- Surface shortages, missing records, incomplete synchronization, and an 8:30 p.m. connectivity/sync warning.

These are planned capabilities. See [the sprint plan](docs/SPRINTS.md) for delivery order and acceptance checks.

## Repository structure

```text
frontend/               React + TypeScript web client
backend/                Fastify + TypeScript HTTP API
docs/SPRINTS.md          Incremental delivery plan
docs/ARCHITECTURE.md     Platform decisions and system boundaries
docs/OWNER_NOTES.md      Original requirements and owner clarifications
SYSTEM_REVIEW.md        Detailed controls and verification scenarios
.github/workflows/      Continuous integration
```

## Requirements

- Node.js 24.x and its bundled npm.
- A modern browser.
- No database is required for Sprint 1. PostgreSQL is planned for Sprint 2.

## Run locally

From the repository root:

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. The backend runs at **http://127.0.0.1:3001**. The workspace's connection card calls the real backend through the frontend's `/api` proxy. Shop names are preview placeholders and the selection is not persisted.

Start either process separately when needed:

```sh
npm run dev -w backend
npm run dev -w frontend
```

The backend accepts optional `HOST` and `PORT` environment variables, defaulting to `127.0.0.1` and `3001`. See `backend/.env.example`; the example is documentation and is not loaded automatically. If the API port changes, update the proxy in `frontend/vite.config.ts` as well. Never commit secrets in environment files.

## Verify and build

```sh
npm run check
```

This runs TypeScript checks, API tests, both production builds, and a local HTTP smoke test of the built frontend/API proxy. Keep ports 3001 and 4173 free during checks. CI runs the same command after a clean install. Build outputs go to `frontend/dist/` and `backend/dist/`. Browser interaction and real-device testing are separate checks; the HTTP smoke test does not replace them.

To smoke-test the built applications, use two terminals after building:

```sh
npm start -w backend
npm run preview -w frontend
```

Open **http://127.0.0.1:4173**. Vite preview is for local verification, not production hosting. A production deployment needs HTTPS, static hosting, and a same-origin `/api` reverse proxy. Authentication and database-backed business endpoints are not implemented yet.

## Current API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public API liveness; returns `status`, `service`, and `version`. |

Unknown/unimplemented routes return 404. No business writes are available in Sprint 1.

## Mobile and offline strategy

The frontend is responsive now; installation and offline transactions are planned for Sprint 7. An installed PWA can provide a shared phone/desktop experience, but iOS and browser background execution must not be treated as guaranteed. Sales will sync on supported triggers, including reopening the app. A missed 8:30 p.m. warning will be shown on resume.

See [architecture and platform decisions](docs/ARCHITECTURE.md) for the tradeoffs, references, and native-client option.

## Development process

Implement one sprint at a time. Keep business decisions and acceptance checks aligned with [SYSTEM_REVIEW.md](SYSTEM_REVIEW.md). Use synthetic data during development. Before committing, run `npm run check` and review the diff for secrets and generated files.

No open-source license has been selected yet. Add an appropriate license before offering this project for reuse.
