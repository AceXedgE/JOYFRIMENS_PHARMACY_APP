# Joyfrimens

A pharmacy workspace for tracking cash sales, drug prices, and stock across two shops and shared main storage.

**Status: Sprint 2 — accounts and shop access.** Staff sign-in, admin account management, shop permissions, price-permission grants, database migrations, and account audit history are implemented. Drug prices, inventory quantities, sales, cash closing, and offline operation remain planned. Do not use this version for real business transactions yet.

Configured shops: **Tomjoy Pharmacy** and **Joyfrimens Pharmacy**, using **Ghanaian cedis (GHS)** and **GMT** (`Etc/GMT`). Each shop has its own shelves and storeroom; shared main-storage rooms 1 and 2 belong to the business and supply both shops.

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
backend/migrations/     Versioned PostgreSQL schema
e2e/                    Browser workflow tests
docs/SPRINTS.md          Incremental delivery plan
docs/ARCHITECTURE.md     Platform decisions and system boundaries
docs/ACCOUNTS.md         Account security, setup, and API reference
docs/OWNER_NOTES.md      Original requirements and owner clarifications
SYSTEM_REVIEW.md        Detailed controls and verification scenarios
.github/workflows/      Continuous integration
```

## Requirements

- Node.js 24.x and its bundled npm.
- A modern browser.
- Local development uses embedded PostgreSQL (PGlite); no separate database installation is needed.
- Production requires a PostgreSQL server, HTTPS, and explicit environment configuration.

## Run locally

From the repository root:

```sh
npm ci
npm run setup:dev
npm run dev
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run setup:dev
npm.cmd run dev
```

Run `setup:dev` once with the API stopped. It migrates the local database and creates the two shops, their storage locations, and a `demo.admin` account with a randomly generated password printed in your terminal. Save that password securely. It refuses to overwrite an existing installation and cannot run against a production or externally configured database.

Open **http://127.0.0.1:5173** and sign in. The backend runs at **http://127.0.0.1:3001**. Admins can create staff accounts, assign shops, enable price-changing permission, and grant shared-storage access from **Staff & permissions**. Staff can change their password under **My account**.

Local data persists in `backend/.data/`, which Git ignores. Run only one API process against this embedded database; stop it before running migration/setup commands. This local server database is separate from the future device-offline transaction store.

Start either process separately when needed:

```sh
npm run dev -w backend
npm run dev -w frontend
```

The backend accepts `HOST`, `PORT`, `APP_ORIGINS`, and optionally `DATABASE_URL`. See `backend/.env.example`; the example is documentation and is not loaded automatically. If the API port changes, update the proxy in `frontend/vite.config.ts` as well. Never commit secrets in environment files. Production migration and admin-bootstrap instructions are in [Accounts and access](docs/ACCOUNTS.md).

## Verify and build

```sh
npm run check
```

This runs TypeScript checks, database/API tests, both production builds, and a local HTTP smoke test of the built frontend/API proxy. Keep ports 3001 and 4173 free during checks. Tests use isolated databases and do not modify your development accounts. Build outputs go to `frontend/dist/` and `backend/dist/`.

After building, run the browser workflow test:

```sh
npm run test:e2e
```

On Windows this uses installed Microsoft Edge in headless mode. Elsewhere, first run `npx playwright install chromium`. `PLAYWRIGHT_CHANNEL` can select another installed channel. CI runs Chromium browser tests and a separate PostgreSQL 17 integration job. Real iPhone/Android device testing remains part of later sprints.

To smoke-test the built applications, use two terminals after building:

```sh
npm start -w backend
npm run preview -w frontend
```

Open **http://127.0.0.1:4173**. Vite preview is for local verification, not production hosting. A production deployment needs HTTPS, static hosting, a same-origin `/api` reverse proxy, and PostgreSQL. Apply migrations and bootstrap the initial administrator before starting the backend.

## Current API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public API liveness; returns `status`, `service`, and `version`. |
| POST | `/api/auth/login` | Create an eight-hour cookie session. |
| GET | `/api/auth/me` | Current user and session CSRF token. |
| POST | `/api/auth/logout` | Revoke the current session. |
| POST | `/api/auth/password` | Change password and revoke all sessions. |
| GET | `/api/shops`, `/api/shops/:id` | Assigned shops and their locations. |
| GET | `/api/storage/shared` | Shared storage, with explicit permission. |
| GET/POST | `/api/admin/users` | List/create staff accounts; admin only. |
| PUT | `/api/admin/users/:id/access` | Grant/revoke employee shop and price permissions. |
| PATCH | `/api/admin/users/:id/status` | Enable/disable another account. |
| GET | `/api/admin/audit` | Latest 100 account audit events; admin only. |

Protected routes require sign-in. State-changing requests require the application header and, except login, a valid session CSRF token. See [the API/security details](docs/ACCOUNTS.md). No sales or stock-quantity writes are available yet.

## Mobile and offline strategy

The frontend is responsive now; installation and offline transactions are planned for Sprint 7. An installed PWA can provide a shared phone/desktop experience, but iOS and browser background execution must not be treated as guaranteed. Sales will sync on supported triggers, including reopening the app. A missed 8:30 p.m. warning will be shown on resume.

See [architecture and platform decisions](docs/ARCHITECTURE.md) for the tradeoffs, references, and native-client option.

## Development process

Implement one sprint at a time. Keep business decisions and acceptance checks aligned with [SYSTEM_REVIEW.md](SYSTEM_REVIEW.md). Use synthetic data during development. Before committing, run `npm run check` and review the diff for secrets and generated files.

No open-source license has been selected yet. Add an appropriate license before offering this project for reuse.
