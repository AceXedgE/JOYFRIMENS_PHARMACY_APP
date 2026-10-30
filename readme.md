# Joyfrimens

A pharmacy workspace for tracking cash sales, drug prices, and stock across two shops and shared main storage.

**Status: core pharmacy workflows implemented; preparing Render deployment.** Sales, offline ticket syncing, daily cash, refunds, permission-bound storerooms, supplier submissions and medicine/variation management are available. Live Render/PostgreSQL and real-device cash-close validation are still required.

Configured shops: **Tomjoy Pharmacy** and **Joyfrimens Pharmacy**, using **Ghanaian cedis (GHS)** and **GMT** (`Etc/GMT`). Each shop has its own shelves and storeroom; shared main-storage rooms 1 and 2 belong to the business and supply both shops.

The same drug and selling unit always have **one shared price across both pharmacies**. An authorized edit changes that price for both shops. Availability is managed separately at each shop.

## Intended workflow

- Find approved drug prices by name, strength, and selling unit.
- Record cash-only sales against the selected shop and actual shelf/storeroom source.
- Track shared main storage supplying both shops through recorded transfers.
- Count notes and set a sales cutoff; later sales stay on the same day and add to the cash available to send or leave as change.
- Audit price changes by admins and specifically authorized employees.
- Save sales locally during outages and synchronize without duplicate transactions.
- Surface shortages, missing records, incomplete synchronization, and an 8:30 p.m. connectivity/sync warning.

Catalogue lookup, audited price editing, stock receiving, and transfers are available now; cash sales and refunds are also available. Cash control now supports closing and owner review. Offline counter workflows are available with the limits documented below. See [the sprint plan](docs/SPRINTS.md) for delivery order and acceptance checks.

## Render hosting and new medicines

See [Render deployment](docs/RENDER_DEPLOYMENT.md) for the prepared hosting settings and instructions to move the existing database and accounts. The checked-in `render.yaml` is an optional free trial template (the database expires after 30 days); no resources have been created.

The add-only import from `docs/newdrugs.md` added 105 medicines and 140 selling options, preserving all 523 existing medicine records. [The import report](docs/NEWDRUGS_IMPORT_REPORT.md) lists every source line, skip, missing price and interpretation. Unlike the earlier reset import, `scripts/import-newdrugs.mjs` never clears business data.

## Repository structure

```text
frontend/               React + TypeScript web client
backend/                Fastify + TypeScript HTTP API
backend/migrations/     Versioned PostgreSQL schema
e2e/                    Browser workflow tests
docs/SPRINTS.md          Incremental delivery plan
docs/ARCHITECTURE.md     Platform decisions and system boundaries
docs/ACCOUNTS.md         Account security, setup, and API reference
docs/CATALOGUE.md        Catalogue workflow, shared prices, and API reference
docs/INVENTORY.md        Receiving, transfers, stock controls, and API reference
docs/SALES.md            Cash sales, receipts, refunds, controls and API reference
docs/CASH_CONTROL.md     Cash movements, counts, closing, owner reports and limits
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

Local data persists in `backend/.data/`, which Git ignores. Run only one API process against this embedded database; stop it before running migration/setup commands. This local server database is separate from the device-offline IndexedDB transaction store.

**Upgrading an existing installation:** stop the API, then run the migration instead of rerunning setup:

```powershell
npm.cmd run db:migrate -w backend
npm.cmd run dev
```

Migration 002 adds the catalogue; migration 003 adds stock receiving, transfers, and immutable inventory history; migration 004 adds complete multi-drug supplier receipts. Existing accounts, locations, and prices are preserved. Do not edit applied migrations or delete the database to upgrade.

## Drug catalogue

Use the counter search on a phone or desktop. Authorized staff can edit prices under **Account > Manage medicines**. Search by drug/brand name, generic name, strength, or barcode. Exact matches appear first, and spelling suggestions are explicitly labeled. Each card shows the strength, form, unit conversion, shared GHS price, and selected-shop availability.

Admins use **Add drug** to define a product and its approved selling-unit prices. A box price is entered explicitly and can differ from its single-unit price multiplied by the pack size. New products are initially listed in the selected shop. At the other shop, an admin can check **Include drugs not listed here** and list the existing drug using the same price.

Admins and employees with price permission can edit a listed unit's shared price without a reason. The form states that both shops are affected. Assigned staff can mark shelf availability; product creation remains admin-only. Old prices and editors remain in admin-only **Account > Activity reports**; stale edits are rejected until the editor reloads current values. See [Catalogue details](docs/CATALOGUE.md).

Start either process separately when needed:

```sh
npm run dev -w backend
npm run dev -w frontend
```

The backend accepts `HOST`, `PORT`, `APP_ORIGINS`, and optionally `DATABASE_URL`. See `backend/.env.example`; the example is documentation and is not loaded automatically. If the API port changes, update the proxy in `frontend/vite.config.ts` as well. Never commit secrets in environment files. Production migration and admin-bootstrap instructions are in [Accounts and access](docs/ACCOUNTS.md).

## Stock receiving and transfers

Open **Stock & transfers** to enter one supplier receipt with up to 100 drug/batch lines, review and confirm it together, split received quantities between locations, dispatch transfers, and confirm arrival. Receipt layout is provisional until a real supplier sample is available. Direct shelf transfers work **Tomjoy → Joyfrimens and Joyfrimens → Tomjoy**, without changing either storeroom. Short receipts remain visible in transit until received or resolved as an audited admin loss. Admins can review supplier receipts and record physical counts with preserved variances.

Adding the same medicine to both shared main storerooms requires explicitly ticking **Allow duplicate in main storerooms**. Medicines may be shared normally across shop shelves and shop storerooms. All inventory writes currently require connectivity. See [Inventory details](docs/INVENTORY.md) for permissions, retry recovery, limitations, and the API.

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
| GET/POST | `/api/shops/:shopId/catalogue` | Search listed drugs / create a drug as an admin. |
| PUT | `/api/shops/:shopId/catalogue/units/:unitId/price` | Change the shared price, with permission and a version check. |
| PUT | `/api/shops/:shopId/catalogue/units/:unitId/availability` | List or change availability in the selected shop; admin only. |
| GET | `/api/shops/:shopId/catalogue/units/:unitId/history` | Read immutable shared-price history. |

Protected routes require sign-in. State-changing requests require the application header and, except login, a valid session CSRF token. See [the API/security details](docs/ACCOUNTS.md), [inventory details](docs/INVENTORY.md), and [cash sales and refunds](docs/SALES.md).

## Mobile and offline strategy

The catalogue and inventory screens are mobile-first: touch-sized controls, stacked cards/forms, and a persistent active-shop selector. Browser tests cover 390px and 320px viewports. Physical iPhone/Android testing is still required. App-shell caching and queued offline transactions are implemented; install prompts and physical-device validation remain Sprint 7 work. An installed PWA can provide a shared phone/desktop experience, but iOS and browser background execution must not be treated as guaranteed. Sales retry while the app is open, on reconnect and when reopening the app. A missed 8:30 p.m. warning will be shown on resume.

See [architecture and platform decisions](docs/ARCHITECTURE.md) for the tradeoffs, references, and native-client option.

## Development process

Implement one sprint at a time. Keep business decisions and acceptance checks aligned with [SYSTEM_REVIEW.md](SYSTEM_REVIEW.md). Use synthetic data during development. Before committing, run `npm run check` and review the diff for secrets and generated files.

No open-source license has been selected yet. Add an appropriate license before offering this project for reuse.

## Counter workflow

Sign in to search medicines and check prices immediately. Choose **Open ticket**, confirm the shop, then add medicines through the same search. Choose the physical stock source and quantity for each addition. On a phone, **View ticket** shows the running total and **Take payment** opens cash checkout.

**The navigation bar** provides Counter, Daily cash, Money out and Account. Account contains sign-out and permitted administration tools. Start selling through **Daily cash > Start day**. Receiving tools are deferred from the main flow. Saved tickets stay with their original shop. This layout uses white, charcoal and blue; the active shop and GMT date remain visible.

Offline selling and automatic foreground synchronization now use durable device storage. Interrupted requests retry with their original keys. Offline refunds/final counts, closed-day conflict correction and production device certification remain outside the implemented offline flow.

## Corrected sales and daily cash model

Shelf inventory quantities are not counted. Medicines start available; staff can mark a selling unit unavailable at their shop, then remove the mark after replenishment. An unavailable medicine shows which shop/main storerooms hold usable stock, without changing the shelf flag. Direct shop-storeroom sales still deduct the storeroom quantity.

Use **Daily cash** to start the day, count money to send, and finally record all cash left before locking up. The sending form counts only GHS 10-and-above notes. Smaller change belongs in the cash-left amount. The final shop balance carries into the next day automatically; differences remain visible for owner review. **Money out** records expenses, advances and withdrawals. Stock receiving is deferred from the current user flow.

The daily cash comparison is: opening cash + sales + extra change brought in - refunds - recorded outflows - money sent = expected cash left. Compare with the physical lock-up balance. Later sales after the sending count are shown separately and included once. Each shop is reconciled independently.

## Fast customer tickets

The counter and ticket search show results only after typing. Open a customer ticket to search, add medicines, change quantities or remove items within one overlay. Shelf is the default source. Checking **From pharmacy storeroom** highlights that item blue and deducts storeroom stock when the sale is confirmed.

The total updates immediately. **Confirm sale** records the medicines without a cash-tender form, drawer selection or receipt display. **Price changed** records either a shortfall or extra retained because change was unavailable, without changing the shared medicine price. Daily cash uses the actual recorded amount and lists these differences for review. Migration 009 preserves historical records and adds the exception audit data.

The counting form accepts quantities of GHS 10, 20, 50, 100 and 200 notes before the cutoff. Press **Finish today's sales** before submitting. Later sales remain on today?s report. Counts stay editable until one final submission saves money sent and cash left together. No separate drawer or advance float is required. Migration 010 stores reporting dates separately from physical cash dates.

Admins do not enter explanations for actions. Activity reports retain who acted and when, including staff creation and permission changes. Employees have a per-shop counting permission; **Count without permission** allows an explicitly recorded exception. Price history is admin-only even when an employee can edit prices.

Current daily workflow: count notes with a selectable sales date (default today); no recipient field. Money out records just amount and reason and deducts immediately, without approval. Account shows profile details and permissions; Change password opens the password form. Apply migration 012 for count dates.

Admins can use **Daily cash > Exception dates** to schedule days without individual medicine tickets. Record one daily sales total, then complete the usual note count and final cash-left entry. **Extra change brought in** records outside money separately from sales. These controls are admin-only and require migration 013.

## Offline counter and ticket records

The prepared counter supports offline reload, cached medicine search, ticket holding/closing and queued sales. Sync retries automatically while the app is open; a visible queue and 8:30pm GMT warning help staff reconnect before closing. HTTPS is required outside localhost. Read [offline operation and limitations](docs/OFFLINE_SALES.md) before deployment, especially device storage, expired sessions and closed-day reconciliation. Migration 016 adds immutable received records and dated-report indexes.

Account contains Settings, administrator Refunds, and date-filtered Activity reports. Only explicit Hold ticket keeps a ticket held; cancelled tickets retain administrator-only evidence.

## Storerooms and supplier deliveries

**Storerooms** is a separate navigation entry for room stock, manual additions, receiving, allocations, transfers, receipts and history. Access is limited to assigned shops and granted main-storage access. Shelf movements are recorded without counted shelf balances; unavailable marks remain manual.

Admins can create private delivery links under **Storerooms > Supplier deliveries > Supplier links**. Suppliers enter expected medicines and quantities on a separate page; receiving staff check actual arrivals and allocations before stock changes. No supplier prices are collected. Links expire after 30 days and can be revoked. External supplier access requires deploying the app at a reachable address. See [storeroom workflow](docs/INVENTORY.md) for details and limitations. Apply migration 018 before running the updated API.

## Unavailable medicines and updates

The Tomjoy document import includes zero-price placeholders labelled **Price needed**. They remain searchable but cannot be sold until priced. Authorised staff can choose **Edit price** directly from counter search. Listed quantity deals are separate selling options (for example, 3 units for GHS10); selecting three single units does not automatically select that deal. See [import review](docs/TOMJOY_IMPORT_REVIEW.md) and [full import CSV](docs/tomjoy-catalogue-import.csv).

Migration 019 permits unpriced catalogue entries and adds a business-dataset revision. An explicitly authorised database reset changes that revision, clears sessions, and clears old device drafts/caches on the next successful sign-in. Ordinary sign-out and upgrades do not clear queued sales. The destructive local-only import script requires `--replace-business-data`; back up and stop the API before using it.

On Counter, **Unavailable medicines** lists shelf units marked unavailable at the active shop. **Download list** exports the complete shop list as a CSV, including GHS prices and storeroom hints. Offline lists use the saved device catalogue and are labelled accordingly.

**Updates** shows medicine additions, shared price changes and relevant shop availability changes, with a personal unread count and paginated history. Updates refresh while the app is running and connected, including on reconnect; phone push notifications are not included. Detailed actor/price audit history remains admin-only. Account permissions are shown only to employees. Migration 017 adds notification records and per-user read state.


### Medicine corrections and removal (24 October 2026)

In Account > Manage medicines, admins can correct a medicine name, optional other names, base unit, selling-option labels and barcodes. Shared details apply to both shops. Unused pack conversions can be corrected; conversions already used by sales or stock must retain their original meaning. Employees with price permission can still change prices but cannot rename or remove medicines.

Remove medicine hides it from active catalogue, sales and receiving choices, retaining its history. Remaining storeroom stock or goods in transit must be resolved first. Admins can use Include removed medicines to restore an entry. Changes record the acting admin and notify staff, without asking for a reason. Historical sales and stock documents retain their original medicine descriptions.

Admins can also add selling units while editing an existing medicine, including medicines already used in stock or sales. Each new unit has a name, number of base units, independent GHS price and optional barcode, and is listed at both pharmacies. Existing unit prices and historical conversions remain protected. Unsaved new units can be removed before saving.

### Variations (26 October 2026)

Add/edit medicine includes a Variation checkbox for additional selling options. Checked options (e.g. syrup alongside inhaler) have independent stock and prices, counted as one of that option per sale, without a base-unit comparison. Unchecked packs retain their base-unit conversion. Receiving, manual additions, transfers, sales, refunds and main-storeroom duplicate checks keep variation batches separate. Shelf availability remains specific to each selling option. Existing options can be corrected before stock or sales records depend on their interpretation; recorded history is not silently reassigned. Existing options are not guessed or automatically reclassified: mark the intended options in Manage medicines.

### Named options and catalogue editing

A medicine can have a main option called Green and an independent variation called Blue, without entering a common unit or conversion. Stock-unit details are shown only for actual packs. The main option and price appear first; Show first changes display order without merging stock. Edit medicine includes all option prices, while quick price editing remains available outside. Price-version checks prevent an older editor overwriting a quick price update. Delete option removes a variation or pack from active use; Delete medicine removes the whole medicine from both shops. Unavailable only flags the shop shelf and leaves the option searchable. Deletion preserves historical records and checks remaining stock and transfers before removing their last active stock option.
