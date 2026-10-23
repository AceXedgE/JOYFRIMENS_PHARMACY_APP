# Stock receiving and transfers

## Current storeroom workflow (2026-10-23)

This section supersedes the historical Sprint 4 descriptions below wherever they mention counted shelves, supplier prices, or the old navigation.

Open **Storerooms** in the navigation bar. It is separate from Counter and contains a room selector, **Receive delivery**, **Add stock manually**, and expandable sections for supplier deliveries, room medicines, transfers, receipts and history. Room medicines can be searched; pack equivalents and loose units remain visible. History is limited to the latest 100 entries per location; the supplier inbox requests 20 deliveries per page.

Only storeroom balances change. A dispatch from a storeroom decreases it; a confirmed receipt into another storeroom increases that destination. Shelf movements retain their quantities in the movement ledger but do not change a remaining shelf balance. Legacy shelf rows remain untouched for historical preservation and are excluded from the location stock response. Shelf physical counts are rejected. Choose a shelf in the location selector to record outgoing goods even without an old batch/balance record. No stock movement clears its unavailable mark.

**Add stock manually** records existing catalogue medicines with their pack quantity, batch and expiry directly into the selected authorised storeroom, without a fictional supplier receipt. Retries use the same request key; each addition records its actor. Receiving or adding a medicine into both main rooms requires the duplicate checkbox. Staff access remains limited to assigned shop locations and, when granted, shared main rooms. Destination names alone do not grant receiving or balance access.

**Supplier deliveries > Supplier links** lets an admin create a private link for one supplier delivery to the selected room. Send that link manually to the supplier. The separate `/supplier` page accepts up to 100 medicine lines, pack sizes and quantities, without prices. Supplier submission does not post stock. Links expire after 30 days, can be revoked, and store only a token hash on the server; the token travels in the URL fragment and authorization header rather than the API URL. An identical retry returns the saved submission. A different submission needs a new link.

Authorised receiving staff open the submission, match each line to a catalogue medicine/pack, and enter actual quantities, batch and expiry. They then review allocations, choose **All to [room]** or custom per-medicine splits, and confirm the whole receipt atomically. Every submitted line and original quantity must remain accounted for, including zero arrivals. The original supplier text remains immutable alongside the received document. Receipts cannot be posted twice for one submission.

The supplier page is part of the local app; suppliers outside the local network need the app deployed at a reachable HTTPS address. No hosting or automatic link messages are configured here. Supplier submission and inventory writes require connectivity. The supplier's input draft is saved in that browser; staff receipt drafts remain unsaved until confirmed, so keep the form open while checking a delivery. The API preserves pending write retries separately from unsubmitted form drafts.

Migration 018 adds supplier links and submissions without deleting stock or historical records. Verify with `npm test`, `npm run build`, and `node scripts/test-storerooms.mjs` (isolated mobile browser test).

Sprint 4 adds online inventory workflows. Cash sales, refunds, drawer accounting, offline allocations, and device synchronization remain later sprints. Inventory records do not create income or cash transactions.

## Upgrade

Stop the API before updating an existing local installation:

```powershell
npm.cmd run db:migrate -w backend
npm.cmd run dev
```

Migration 003 adds inventory tables without resetting accounts, locations, catalogue entries, or prices. Migration 004 adds multi-drug supplier documents while preserving existing receipts, approvals, and stock. Migrations 001 through 003 are unchanged. Existing stock is not guessed or seeded: enter an evidenced initial delivery using its actual batch and expiry. Never reset the database to upgrade. Back up production before migrations using the deployment's PostgreSQL backup process.

## Locations and permissions

The six existing locations are Tomjoy's shelves and storeroom, Joyfrimens's shelves and storeroom, and shared main-storage rooms 1 and 2. Open **Stock & transfers**, choose the shop and then its stock location. Authorized shared storage appears in the location selector; employees assigned only shared storage can also use this screen.

- Admins can use all locations, post counted adjustments, review supplier receipts, and resolve confirmed transit losses.
- Employees can receive deliveries into and dispatch from locations belonging to their assigned shops. Shared locations require the separate shared-storage grant. Price-changing permission gives no inventory adjustment or approval authority.
- Dispatchers can see destination names across the business so they can send goods to the other shop. This does not grant access to that destination's balances or permit confirming its receipts.
- Receipt confirmation requires access to the destination. Either endpoint's authorized staff can read that transfer's history, including the receiving employee and discrepancies.
- Permissions and sessions are checked on each request. Mutations lock current user/session and membership records so revocation cannot silently race past a write.

## Supplier deliveries

Define the drug and its immutable pack conversion in **Drug prices** first. In **Receive supplier delivery**, select the drug and pack, enter the supplier/reference, batch number, exact expiry date, supplier quantity, and actual received packs. Quantities are whole packs; choose the base-unit option for broken or mixed packs of the same batch.

The server converts packs to base units. For a carton containing 100 tablets, 3 invoiced cartons and 2 received cartons become an expected quantity of 300 and a received quantity of 200. Allocate exactly 200 tablets across accessible locations, for example 150 directly to shelves and 50 to the shop storeroom. Do not separately record those allocations as additional receipts. One receipt has one supplier/reference header and 1 to 100 drug/batch lines, each allocated across up to six locations. Use separate lines for different batches of the same drug. Combine repeated entries for the same drug/batch/expiry into one line, using base units for mixed packs.

Supplier and reference are normalized to lowercase for duplicate detection. For new multi-drug documents, the entire supplier/reference combination cannot be received twice, even under a different request key or by another employee. The older single-line API remains compatible with existing receipts, but cannot add to a completed multi-drug document; the new API also refuses a reference already used by legacy receipts. An invalid allocation rolls back the entire delivery. Zero actually received is allowed with a zero allocation and an explanation, preserving evidence of a completely missing line. Supplier figures, actual figures, receiving employee, timestamp, reference, and notes are immutable.

Use **Save drug line** and **Add another drug** to build the receipt. Saved lines can be edited or removed before posting. **Review receipt** shows every drug, batch, conversion, expected and actual quantity, discrepancy, and allocation. **Confirm entire receipt** posts all lines in one transaction. A failure on any line rolls back the entire receipt. Saving a line or opening review does not change stock. Draft entry is currently in memory: closing the form, switching shops/locations, or reloading before confirmation discards unsaved work; offline drafts remain future work.

Under **Supplier receipts**, choose **Open supplier receipt** to reopen the complete saved document. The initial layout is provisional and can be adjusted when a real supplier receipt sample becomes available. Supplier uploads, PDF/photo attachments, OCR, invoice pricing and tax fields are not included in this change. Admins enter approval notes and choose **Approve delivery record**. Approval applies to every line in the document together and records the reviewer and time without rewriting the receipt or changing stock again. A grouped line cannot be approved through the older single-line endpoint. Full-document viewing requires access to every allocated location; staff without that access can still see their permitted location ledger and ask an admin to review the full receipt. This is an administrative review, not a quarantine/release system: actual received stock is included immediately. A short delivery stays short in its original record even after approval. Further supplier deliveries need their own reference; corrections use explicit admin count adjustments and supporting notes, never silent receipt edits.

## Transfers

Supported routes include main storage to either shop, a shop's storeroom to its shelves, and **Tomjoy shelf → Joyfrimens shelf or Joyfrimens shelf → Tomjoy shelf**. Direct shelf transfers do not touch either storeroom.

1. At the actual source location, choose the drug/batch, **Transfer or count**, destination, base-unit quantity, and reason.
2. **Dispatch stock** removes that quantity from the source and records it in transit. It is not yet available at the destination.
3. Staff with access to the destination enter only what they count under **Actually received now**, with notes, then confirm receipt.
4. Partial receipts leave the difference in transit. Later receipts record only newly arrived units. A zero receipt can document that nothing arrived.
5. If investigation confirms a loss, an admin can choose **Resolve missing stock as loss** for the outstanding quantity and explain the outcome. That is a permanent, audited inventory loss, not a sale or a cash expense. Staff cannot resolve losses themselves.

Example: dispatch 40, receive 35, then find 5 later. The source decreases by 40, the destination increases by 35 then 5, and transit decreases from 40 to 5 to 0. If the last 5 are confirmed lost instead, the loss is explicit and total inventory decreases by 5. **View transfer history** preserves each step, employee, timestamp in GMT, and receipt discrepancy.

There is no silent cancellation or destination edit after dispatch. Physically returned goods require an evidenced receipt followed by a new reverse transfer. Pending transfers remain visible; the screen also includes the latest 100 closed transfers at that location. No price changes result from transfers.

## Counts, expiry, and reservations

Admins open **Transfer or count → Post a physical count**. The ledger preserves the previously expected quantity, counted quantity, signed variance, employee, and reason. A concurrent movement invalidates the displayed version: reload and recount rather than overwriting newer stock. Counts apply to the selected location and batch, not a combined shop total.

Batches have a mandatory expiry date. The app refuses supplier receipts or dispatches on or after that date in GMT. Existing expired stock remains visible and can be counted down with an explained admin adjustment. A transfer received after its batch expires still records the physical arrival and remains flagged expired; it cannot be dispatched again. Quarantine, supplier-return, and disposal workflows are not separately modeled yet.

Balances include a reserved quantity, and dispatch/count deductions cannot go below it. There is no API to allocate reservations yet; exclusive offline device allocations arrive in Sprint 7. The later sales implementation must also respect these balances and locks. Catalogue availability is a separate listing flag, not a quantity: receiving stock does not automatically list a drug or mark it available for sale.

## Integrity and interrupted connections

Stock operations, ledger entries, supplier receipts, approvals, and batch identities are append-only. Balances and transfer progress are transactionally updated projections. Each operation has an actor-scoped UUID request key; replaying the same request returns its original result without moving stock again. Reusing the key with a changed payload fails. Batch locks serialize competing mutations; stock cannot become negative, exceed the configured bound, or consume reservations. Posting and audit entries commit together.

The client saves an unconfirmed request and its key in browser session storage before sending. If the response is lost, **Retry pending request** sends the original request. This survives a reload in the same tab and preserves its original locations when switching shops. New inventory submissions are blocked in that panel until the request is resolved. This is online request recovery, not an offline queue or backup. Closing the tab, clearing browser data, or using another device may remove that recovery record; check the ledger before manually entering another movement. Storage must be available before the client submits stock writes.

## API

All endpoints require authentication. POST requests require `X-Requested-With: joyfrimens`, the session CSRF header, a UUID `requestKey`, and meaningful `reason` text. Body schemas reject unknown fields, fractional quantities, and numeric strings. Prices are not part of these requests. Quantity bounds are 0–100,000,000 base units; dispatch and loss quantities must be positive.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/inventory/options` | Accessible source/receipt locations, destination labels, catalogue pack definitions, adjustment capability. |
| GET | `/api/inventory/locations/:id` | Batch balances, all outstanding and latest 100 closed transfers, latest 100 location ledger entries. |
| POST | `/api/inventory/deliveries` | One supplier/reference, receipt reason, and 1 to 100 lines; atomic posting and replay protection. |
| GET | `/api/inventory/deliveries/:id` | Full supplier document, ordered lines, allocations and approvals; all-location access required. |
| POST | `/api/inventory/deliveries/:id/approve` | Admin approval for the whole document. |
| POST | `/api/inventory/receipts` | Legacy single-line receiving API, retained for compatibility. |
| POST | `/api/inventory/receipts/:id/approve` | Separate immutable admin approval of a supplier receipt. |
| POST | `/api/inventory/transfers` | Dispatch from authorized source into transit. |
| POST | `/api/inventory/transfers/:id/receive` | Confirm actual base units at the authorized destination, with `expectedRemaining`. |
| POST | `/api/inventory/transfers/:id/loss` | Admin-only confirmed loss, with `expectedRemaining`. |
| GET | `/api/inventory/transfers/:id/history` | Full dispatch/receipt/loss history for authorized endpoint staff. |
| POST | `/api/inventory/counts` | Admin count with `expectedVersion`; preserves variance. |

The receiving dropdown loads shared catalogue definitions but never another shop's prices or stock balances. Location balances and catalogue options currently load as whole lists, suitable for the initial pilot; larger deployments need server-side search/pagination. Older ledger entries remain in the database, but general ledger export and full history browsing beyond the latest 100 entries are not implemented. Transfer histories remain accessible in full. Combined reporting and formal backup/restore drills belong to later sprints.

## Verification

Backend integration tests cover upgrade from Sprint 3, preserved catalogue/accounts, carton conversion, split allocations, immutable supplier discrepancies, approval authorization, duplicate references, retry keys, both shelf directions, shared/internal routes, partial receipts, explicit transit losses, stock conservation, reservations, concurrent deductions, stale counts, expiry, CSRF, access revocation, and immutable records. Tests support both isolated PGlite and the existing PostgreSQL CI job. Browser coverage exercises phone-width receiving, an interrupted committed dispatch and reload/retry, shelf transfers in both directions, discrepancy history, and 320px overflow checks. Physical iOS/Android and deployed PostgreSQL remain release validation steps.

Multi-drug verification adds a 22-drug receipt, rollback of an invalid final line, duplicate reference/retry protection, unauthorized allocation/document reads, duplicate drug/batch rejection, different batches of one drug, all-line approval, concurrent duplicate submissions, and migration preservation of existing inventory records. The mobile browser workflow covers multiple drugs, line editing, the review screen, reopening the document, and complete-receipt approval.

## Main-storeroom duplicate confirmation

The same catalogue medicine may be stocked normally across shop shelves and shop storerooms. Adding positive stock to a main storeroom is blocked if that medicine already has positive stock in the other main storeroom, including a different batch or expiry. This compares the existing product identity, not just the drug name or batch. Normal restocking within a single main room is allowed while the other room has none. Zero-stock history does not count as duplication.

To intentionally stock it in both main rooms, tick **Allow duplicate in main storerooms** on the supplier drug line, incoming transfer receipt, or admin physical count. The server requires an explicit boolean `forceDuplicate: true` on that operation (per line for multi-drug receipts), and records the confirmation with the audited request. The checkbox never creates extra stock by itself or relaxes quantity, expiry, permission, or receipt retry checks. Transfer dispatch remains a movement into transit; the duplication check applies when the destination receives it.

Product locks serialize additions across different batches so simultaneous receipts cannot both bypass the rule. Earlier records are retained, not removed. Existing duplicated main-room stock, if any, needs confirmation again for further positive additions.

Verification: 46 backend tests passed, including different batches, positive counts, transfer receipts, and concurrent main-room arrivals. After building, run `node scripts/test-main-room-duplicate.mjs` for the isolated 390px browser regression (ports 4189 plus an automatically assigned API port). This uses temporary in-memory data and does not change the local demo inventory.

Owner-notes follow-up: supplier documents accept up to 100 lines within a 512 KiB request limit. Inventory cards show configured pack equivalents and loose remainders alongside exact base-unit balances. Operational timestamps include GMT weekday/date.
