# Architecture and platform decisions

## Web first, mobile ready

Start with a responsive web frontend and progressively add installable PWA capabilities in Sprint 7. Both shops can access one deployed application from phones or computers. A later native client can reuse the HTTP API; native packaging is an option, not a current dependency.

iOS is not a reason native apps are impossible. The web approach reduces the initial client/distribution work, while accepting constraints: local device data is not a backup, offline permission revocation is delayed, and closed-app execution cannot be assumed. If guaranteed device-local scheduled reminders or stronger managed-device storage become essential, revisit a native client.

Apple supports web push for supported Home Screen web apps, but push requires connectivity and is not an offline 20:30 alarm. Background sync is not available everywhere; retries on launch/resume, successful server reachability, and manual action are mandatory.

References: [Apple web push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [MDN background sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API), [MDN storage persistence](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Code boundaries

- `frontend/`: React + TypeScript, built with Vite. Responsive UI and API client now; catalogue, drafts, local transaction database, and service worker later.
- `backend/`: Fastify + TypeScript on Node 24. Health endpoint now; authentication, authorization, validation, domain operations, and persistence later.
- PostgreSQL is the planned server database from Sprint 2; it is not installed or required by Sprint 1.
- Local transactional browser storage is planned for Sprint 7. Cache Storage will hold app assets, not be the financial transaction database.

Development proxies `/api` through Vite to `127.0.0.1:3001`. Production should serve frontend assets over HTTPS and reverse-proxy `/api` to the backend on the same origin. Do not expose production business endpoints until authentication and authorization exist. Avoid permissive cross-origin defaults. Public health returns liveness only, not database readiness or sync completeness.

## Core invariants for later sprints

1. A completed sale belongs to one shop and drawer session forever; stock sources belong to that shop. Shared main storage supplies shops through transfers.
2. All customer payments are cash. Tender minus change is the sale amount.
3. Posted records are corrected through linked entries, not silent edits/deletions.
4. Stock transfers conserve quantities; internal money transfers are not sales.
5. Counts are observations, not replacements for expected cash balances.
6. Sale IDs survive retries. Database transactions post all related ledger effects together.
7. Offline completed sales keep actual prices and original session/date. Server receipt time is separate.
8. Authoritative server checks are required for access, prices, units, quantities, and totals. Client UI checks are not authorization.

Full requirements and edge cases are in [SYSTEM_REVIEW.md](../SYSTEM_REVIEW.md). Original owner notes are preserved in [OWNER_NOTES.md](OWNER_NOTES.md); later confirmed rules override early brainstorming.
