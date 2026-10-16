# Delivery sprints

Work through these in order, reviewing the running result at the end of each sprint. Sprints 1–4 are implemented. Subsequent sprints are planned, not completed features. A sprint is done when its acceptance checks pass and its limitations are documented.

## Sprint 1 — Project foundation

Deliver separate frontend/backend workspaces, a responsive development preview, API liveness and connection feedback, build/type checks, API smoke tests, CI, and project documentation.

Acceptance:
- [x] Frontend and backend have separate source, configuration, and build outputs.
- [x] Shop preview visibly switches between two placeholder shops without pretending to save business data.
- [x] Frontend probes the API and handles unavailable/invalid responses with a retry action.
- [x] No financial values, sales writes, or authenticated shop data are simulated as real.
- [x] Dependency installation, type checks, API tests, and production builds pass.
- [x] Local HTTP integration smoke check passes.

Sprint 1 complete: both TypeScript checks, two API tests, both production builds, and the built frontend/API proxy smoke check passed locally. The Windows sandbox blocked Vite's parent-directory reads; the build and smoke check passed outside the sandbox. Browser workflow coverage was added in Sprint 2; physical phone checks remain planned.

Not included: authentication, database, actual shops, catalogue, sales, installable PWA, or offline storage. Database readiness is not implied by the liveness endpoint.

## Sprint 2 — Accounts, shops, and database

Add PostgreSQL migrations, user authentication and session handling, admin bootstrap without default passwords, roles and explicit permissions, two configured shops, shop-scoped access, and shared main-storage ownership. Implement validated environment configuration and audit events. Confirmed configuration: Tomjoy Pharmacy and Joyfrimens Pharmacy, GHS, GMT (`Etc/GMT`), web frontend. Refund/withdrawal/stock-adjustment approvals remain deferred to their relevant sprints; price permission does not imply them.

Acceptance: staff cannot request another unauthorized shop's data through an API; employees cannot grant themselves permissions; admins can grant/revoke price permission; auth/session lifecycle works; shared storage is not assigned arbitrarily to a shop. Test migrations against a fresh database. Provide safe development seed data distinct from production setup.

Sprint 2 implemented and verified locally: 16 database/API checks, TypeScript checks, production builds, HTTP smoke test, and one end-to-end browser workflow covering admin and employee behavior. Migrations were tested on fresh embedded PostgreSQL, including repeat application. Headless Edge passed desktop and 390px viewport interactions. CI additionally defines PostgreSQL 17 and Chromium checks; those hosted jobs have not been run locally. Deployment-specific PostgreSQL permissions and physical iPhone/Android testing remain release checks. Setup and limitations are documented in [ACCOUNTS.md](ACCOUNTS.md).

## Sprint 3 — Drug catalogue and price lookup

Add product strength/form, units and pack conversions, shared prices, shop-specific availability, search with ranked spelling suggestions, price history and authorized price editing. Owner clarification on 2026-10-16: both shops always use the same price for the same selling unit, and the client is primarily used on mobile phones.

Acceptance: exact matches rank first, long names are searchable, suggestions never automatically substitute a drug, unauthorized price edits fail, concurrent edits are detected, and old price versions remain available. Use integer minor currency units with explicit rounding.

Implemented: shared product/unit definitions, one price per selling unit, shop listings, immutable price history, audited price/availability edits, permission rechecks, optimistic versions, safe decimal-to-pesewa conversion, ranked search and pagination, and mobile cards/forms with a persistent shop selector. Product identity/conversions are immutable; no stock or sales workflows are included. See [CATALOGUE.md](CATALOGUE.md) for behavior, limits, and upgrade instructions.

Verification: 29 backend checks passed, including migration from Sprint 2 without resetting accounts/storage. Two browser workflows cover accounts and catalogue, with catalogue checks at 390px and 320px. Type checks and production builds passed. Headless Edge and embedded PostgreSQL were used locally; hosted PostgreSQL CI and physical-phone checks remain separate.

## Sprint 4 — Receiving, storage, and transfers

Implement both shared main-storage rooms, both shops' shelf/storeroom locations, supplier receipt versus actual receipt, split receiving, batches/expiry, stock ledger, counted adjustments, and dispatched/in-transit/received transfers.

Direct shelf-to-shelf transfers must work in both directions: Tomjoy Pharmacy to Joyfrimens Pharmacy and Joyfrimens Pharmacy to Tomjoy Pharmacy. Neither shop's storeroom is involved in these movements. Record the actual source shelf, destination shelf, drug/batch, quantity, dispatching employee, receiving employee, and timestamps. Dispatch removes stock from the source into transit; confirmed receipt makes the received quantity available on the destination shelf. Preserve shortages or other receipt discrepancies for review; these movements generate no sale or cash entry.

Acceptance: quantities are conserved, direct-to-shelf deliveries are recorded, transfer retries do not duplicate stock, recipient discrepancies persist, and unauthorized location access fails. Verify carton-to-base-unit calculations and concurrent stock deductions.

Verify direct shelf-to-shelf transfers in both directions leave both storeroom balances unchanged, count in-transit stock only once, block unavailable or reserved quantities, and require authorized dispatch and receipt at the respective shops.

Sprint 4 implemented: migration 003, batch/location balances, immutable stock ledger, supplier versus actual receipts with split allocation and separate admin review, both direct shelf transfer directions, shared/internal routes, partial receipts, auditable transit losses, admin counts with variance/version checks, expiry checks, permission rechecks, and idempotent request recovery. The mobile interface keeps actual locations explicit. See [INVENTORY.md](INVENTORY.md) for usage, API, and current limits.

Verification: 42 backend tests passed, including upgrade from Sprint 3, stock conservation, concurrent deductions, reservations, authorization, and immutable records. Three browser workflows passed, covering accounts, catalogue, and mobile inventory with a committed-but-lost dispatch response followed by reload/retry. TypeScript, production builds, and built API/frontend smoke checks passed. Local verification used PGlite and headless Edge; deployed PostgreSQL, hosted CI, and physical iOS/Android checks remain separate. Inventory writes are online-only. Full ledger exports and larger-catalogue pagination remain future work.

Sprint 4 follow-up: migration 004 adds a supplier receipt header with up to 100 drug/batch lines, phone-friendly line editing and full-receipt review, atomic confirmation, document-level duplicate protection, reopening saved documents, and whole-document admin approval. Existing single-line receipts remain unchanged. The layout is provisional pending a real supplier receipt sample; uploads and invoice pricing are not implemented. Follow-up verification: 44 backend tests, three browser workflows, TypeScript checks, and production builds passed, including a 22-drug receipt and preservation of existing inventory during migration.

## Sprint 5 — Cash sales and receipts

Implement shop-bound drafts, source location per sale line, shelf/storeroom mixed baskets, location warning/confirmation, cash tender/change, unique receipts, atomic stock/cash/sale posting, idempotency, and controlled returns/refunds. Create drawer sessions and their opening floats.

Acceptance: changing shops cannot move a draft, underpayment/noncash checkout fails, sold quantities are deducted once, historical prices remain intact, retries cannot duplicate sales, and cumulative refunds cannot exceed the original receipt. Online flow only until Sprint 7.

## Sprint 6 — Cash closing and owner review

Implement expenses, staff advances, owner withdrawals, approvals, A/B drawer switch, cash denomination counts, float transfers, handovers, shop/category reports, shortages/overages, manual exception days, and reviewable audit history.

Acceptance: counts never overwrite expected amounts, opposite drawer variances do not cancel unnoticed, transfers are not revenue, post-count sales stay on their original business date, and category reports include all physical cash in reconciliation. Backfilled manual sales must not duplicate totals.

## Sprint 7 — Offline selling and installable PWA

Add app-shell installation/caching, transactional local storage and upload queue, bounded offline authorization, exclusive stock allocations, device/drawer assignments, restart recovery, sync/conflict UI, stale-price handling, provisional closing, and shop-timezone 20:30 warnings. Add push notifications only with an explicit permission flow and platform validation.

Acceptance: loss of connectivity or app restart does not lose a committed local sale; a lost acknowledgment cannot duplicate posting; two devices cannot spend the same allocated stock; price/permission mutations need connectivity; late uploads retain session/date; blocked uploads remain visible; offline/reachable-but-unsynced states both trigger warnings; missed warnings appear on resume. Test real iOS Safari/Home Screen and Android devices. Never promise a closed/offline phone will execute a timer at exactly 20:30.

## Sprint 8 — Pilot and release readiness

Exercise end-to-end roles, real shop processes, accessibility/mobile usability, deployment over HTTPS, backup/restore, recovery exports, monitoring, reconciliation, and security controls. Use a limited pilot and compare app figures against independently counted stock and cash before routine use.

Acceptance: restore/reconciliation drill passes; no unresolved critical authorization or data-loss issues; real-device offline scenarios pass; operators can recover from a lost device using the agreed procedure. Record remaining risks and operating instructions. Release only the features proven in the pilot.
