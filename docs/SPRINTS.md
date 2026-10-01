# Delivery sprints

Work through these in order, reviewing the running result at the end of each sprint. Only Sprint 1 is in the current implementation scope. Subsequent sprints are planned, not completed features. A sprint is done when its acceptance checks pass and its limitations are documented.

## Sprint 1 — Project foundation

Deliver separate frontend/backend workspaces, a responsive development preview, API liveness and connection feedback, build/type checks, API smoke tests, CI, and project documentation.

Acceptance:
- [x] Frontend and backend have separate source, configuration, and build outputs.
- [x] Shop preview visibly switches between two placeholder shops without pretending to save business data.
- [x] Frontend probes the API and handles unavailable/invalid responses with a retry action.
- [x] No financial values, sales writes, or authenticated shop data are simulated as real.
- [x] Dependency installation, type checks, API tests, and production builds pass.
- [x] Local HTTP integration smoke check passes.

Sprint 1 complete: both TypeScript checks, two API tests, both production builds, and the built frontend/API proxy smoke check passed locally. The Windows sandbox blocked Vite's parent-directory reads; the build and smoke check passed outside the sandbox. Browser interaction and real-phone visual checks have not yet been performed. Next: Sprint 2.

Not included: authentication, database, actual shops, catalogue, sales, installable PWA, or offline storage. Database readiness is not implied by the liveness endpoint.

## Sprint 2 — Accounts, shops, and database

Add PostgreSQL migrations, user authentication and session handling, admin bootstrap without default passwords, roles and explicit permissions, two configured shops, shop-scoped access, and shared main-storage ownership. Implement validated environment configuration and audit events. Determine currency, shop timezone, device platform, and staff approval powers before finalizing related schema.

Acceptance: staff cannot request another unauthorized shop's data through an API; employees cannot grant themselves permissions; admins can grant/revoke price permission; auth/session lifecycle works; shared storage is not assigned arbitrarily to a shop. Test migrations against a fresh database. Provide safe development seed data distinct from production setup.

## Sprint 3 — Drug catalogue and price lookup

Add product strength/form, units and pack conversions, shop prices, availability, search with ranked spelling suggestions, price history and authorized price editing. Resolve whether prices should always match across shops.

Acceptance: exact matches rank first, long names are searchable, suggestions never automatically substitute a drug, unauthorized price edits fail, concurrent edits are detected, and old price versions remain available. Use integer minor currency units with explicit rounding.

## Sprint 4 — Receiving, storage, and transfers

Implement both shared main-storage rooms, both shops' shelf/storeroom locations, supplier receipt versus actual receipt, split receiving, batches/expiry, stock ledger, counted adjustments, and dispatched/in-transit/received transfers.

Acceptance: quantities are conserved, direct-to-shelf deliveries are recorded, transfer retries do not duplicate stock, recipient discrepancies persist, and unauthorized location access fails. Verify carton-to-base-unit calculations and concurrent stock deductions.

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
