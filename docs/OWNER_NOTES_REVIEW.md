# Owner notes alignment review

Update 2026-10-21: the historical assessment below is superseded for sales and cash by the latest OWNER_NOTES clarification. Shelf quantities are untracked; default availability, manual unavailable marks and storeroom hints are implemented. Daily cash now separates remittance counting from final lock-up, carries actual remaining cash by shop, and preserves discrepancies for owner review. Receiving UI is deferred. Offline support remains pending. See CASH_CONTROL.md for the current flow.

Reviewed 2026-10-17 against `OWNER_NOTES.md`, current frontend/backend source and the Sprint 1–5 implementation. Later owner clarifications take precedence over the early brainstorming. This is a requirements/code review, not a new physical-device test or a claim that all theft risks are covered. Previously reported automated checks remain useful evidence for the implemented flows.

## Assessment

The app substantially matches the online price lookup, stock movement and cash-sale portions. It does not yet complete the owner's main end-of-day cash accountability workflow. Completing five of eight sprints is not a meaningful percentage of business requirements covered.

| Owner requirement | Current fit | Evidence / remaining work |
| --- | --- | --- |
| Find prices, highlight matches, rank accurate names first, tolerate misspellings | Mostly covered | `Catalogue.tsx` highlights text; `catalogue-search.ts` ranks exact/prefix/contains/suggestions. Suggestions use bounded spelling distance, not the ambiguous original six-letter rule. Sales and receiving searches use simple substring matching. |
| Choose singles/boxes, multiple drugs, calculate line and basket totals | Covered online | `Sales.tsx`, `sales.ts`: explicit selling units/conversions, quantities, shared unit prices and total. This is a basket calculator, not a standalone general calculator. |
| Admins and specifically permitted employees change prices; retain history | Covered | `catalogue.ts`: permission checks, shared prices across both shops, old/new prices, actor, initiating shop, reason and timestamp. Historical receipts retain paid prices. |
| Mark drugs unavailable | Covered | Shop-specific unit availability is separate from shared pricing and physical stock. Checkout rechecks it. |
| Always show selected shop; keep baskets and stock at their original shop | Covered | Sticky selector in `accounts.css`; `App.tsx` navigation guard; original actor/shop-bound drafts in `sales.ts`. Nonempty baskets are parked before switching. |
| Location-off warning; warn for wrong shop or inaccurate location | Partial | Manual confirmation and unavailable-location warnings work. `Sales.tsx` ignores returned coordinates/accuracy; there is no shop-coordinate configuration or mismatch detection. |
| Two main rooms, shop shelves/storerooms, direct retail receipts and split allocations | Covered | Inventory routes and delivery editor preserve the six independent locations. Transfers supply shops and move shelf-to-shelf in either direction. Main-room duplication needs explicit override. |
| Record supplier promised versus received quantities, review before saving | Mostly covered | Multi-line receipt editor, split allocations, confirmation, discrepancy display and admin approval exist. Purchase unit prices/invoice monetary totals and supplier uploads/portal are absent; actual receipt format remains intentionally deferred. |
| Supplier can send many medicines in one receipt | Partial: defect found | The editor/schema advertise 100 lines, but `/api/inventory/deliveries` inherits the 16,384-byte server limit. A representative 100-line payload with short notes is 27,537 bytes. Larger valid documents can be rejected before business validation. Existing 22-line coverage does not prove the advertised limit. |
| Take singles from cartons and see remaining cartons plus singles | Arithmetic covered; display missing | Base-unit balances/conversions conserve quantities, but inventory cards show only base units. They do not render the example “2 cartons + 13 singles; 1 carton = 14.” |
| Cash-only payment, tender/change, original receipts, mixed shelf/storeroom sales | Covered online | Transactional stock/cash/sale posting, current-price checks, immutable receipts and replay protection. Returns use original prices and admin authorization; quarantine is excluded from sellable stock. |
| Date, especially day of week | Partial | Sales/stock timestamps show GMT date/time. Most operational screens omit weekday; the admin audit view includes it. |
| Count while selling from another drawer, record float transfers, retain next-day float | Planned Sprint 6 | Drawer opening and expected cash exist. Counting, switching, closing, paired float transfers and carry-forward are absent. |
| Daily totals sent/submitted to admin, counter identity, denomination totals, before/after count amounts | Planned Sprint 6 | Audit trails and receipts are foundations; there is no complete daily count/submission/reconciliation workflow. |
| Late sales separately visible without corrupting next-day totals | Planned Sprint 6; current operational limitation | Sales inherit the drawer's opening business date (`sales.ts`). With no closing/rollover yet, reusing a drawer across dates keeps that old business date. Correct date handling needs explicit acceptance coverage before routine multi-day use. |
| Suspicious totals, shortages/overages and admin review | Planned Sprint 6 | Transaction guards prevent certain invalid records, but do not detect unrecorded physical theft or reconcile counted cash with expected cash. |
| Personal spending, withdrawals and amounts taken during the day | Planned Sprint 6 | No cash-out workflow yet. Expected cash currently covers opening float, sales and refunds only. |
| Manually assign drug categories and report them separately with show/hide detail | Planned Sprint 6 | No category schema/editor or category cash reporting exists. Category assignment must be included, not only grouped reports. Category totals must still reconcile with total physical cash. |
| Admin-authorized exempt/manual days, still report totals | Planned Sprint 6 | No exception-day workflow yet. |
| Durable offline sales, auto-upload, sync totals/status, 20:30 warnings | Planned Sprint 7 | Current session-storage retry protects interrupted online requests. It is not durable offline sales storage and does not satisfy persistence across closing the tab, logout or updates. |
| Mobile-first use | Substantially covered; real-device validation pending | Responsive forms and 320/390px browser checks exist. Physical iOS/Android operation and offline lifecycle tests remain release work. |

## Recommended order before advancing

1. Correct and regression-test the supplier document request-size mismatch.
2. Finish the small operational presentation gaps: carton/remainder display, explicit GMT weekday/date, and consistent medicine search in the sales workflow.
3. Carry geographic matching as an explicit unfinished requirement. Accurate shop coordinates and a suitable distance/accuracy policy are needed; location availability alone must not be described as verification.
4. Keep Sprint 6 focused on the central owner objective: full cash movements, counting and reconciliation, business-date lifecycle, owner review, category creation/assignment and exempt days.
5. Keep offline functionality and 20:30 warnings explicitly pending Sprint 7. Review supplier invoice prices/layout when the promised real sample is available.

The initial review above did not change business data or application behavior.

## Follow-up fixes, 2026-10-17

The following supersede the corresponding gaps in the review table:

- Supplier document requests now allow 512 KiB while retaining the 100-line and individual field limits. A new regression posts 100 detailed lines, checks rollback for an invalid final line, verifies retry deduplication, and rejects 101 lines.
- Stock cards retain exact base-unit totals and show pack equivalents plus loose remainders for each configured larger selling unit. These are equivalent quantities, not an assertion that physical cartons are sealed.
- Sales search now uses the same backend ranking as the price catalogue, including generic names, labelled spelling suggestions and literal numeric-strength matching. Selecting the medicine, batch and source remains explicit. Receiving search remains substring-based.
- Sales receipts, receipt lists, inventory history, supplier receipts and price history now show weekday, calendar date and GMT time consistently. Database dates and timestamps are unchanged.
- Verification: all 60 backend tests and both production builds passed, including pack remainder and GMT midnight-boundary checks. The isolated mobile browser regression also passed, including labelled spelling suggestions without automatic selection, checkout, shop switching, lost-response recovery, refunds and 320px layout.

Actual shop-coordinate comparison remains unfinished pending reliable shop locations. Manual shop confirmation and location-unavailable warnings remain active. No geographic verification is claimed. The Sprint 6/7 work and deferred supplier invoice pricing/layout remain outstanding. No local stock or cash records were altered by these fixes.

## Sprint 6 follow-up

The cash-closing, cash-out, owner-review, category and manual-day rows above are now superseded by the implemented workflows in [CASH_CONTROL.md](CASH_CONTROL.md). Previous-day drawers are blocked from normal sales/refunds and cash payments until closed. The implementation preserves drawer variances and original sale categories; itemized manual backfill and immutable-count correction remain unimplemented rather than silently simulated. Location comparison still awaits shop coordinates, and offline work remains Sprint 7.
