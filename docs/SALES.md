# Cash sales and receipts (Sprint 5)

Sales are online-only, cash-only, in GHS. The app opens directly to medicine search and prices after sign-in. Use **Daily cash > Start day** before selling. The first starting cash balance requires an administrator; later days carry the previous actual lock-up balance. Opening cash is not sales income.

## Selling on a phone

1. Choose **Open ticket**. The single customer-ticket overlay contains the shop confirmation, search, selected medicines and total. No buyer details are required.
2. Type to search; no medicine list appears before typing. Results retain exact-first ranking, highlights and labelled spelling suggestions.
3. Tap Add. Items default to the shelf. Change quantities and remove items directly in the ticket. Check **Storeroom** only when physically taking that medicine from the shop storeroom. Such items turn blue and show a Storeroom label; unchecking restores the shelf styling. If multiple usable batches exist, the actual batch can be selected inline.
4. The total updates immediately in the frontend. Normally there is no cash-entry field. Use **Price changed** only for a short payment or extra retained because change was unavailable. Enter the actual amount for that medicine line; no reason is requested. This leaves shared prices unchanged.
5. **Confirm sale** saves the selected medicines and actual recorded total. No drawer selection, payment modal, receipt display or printing is exposed. Existing internal cash sessions and historical receipt records remain for reconciliation and audit compatibility.
6. Close to save the current ticket, or Hold to continue another customer. Tickets and local edits remain bound to their original shop and staff account.

## Controls

- Checkout rechecks access, current shared price/version, shelf availability and drawer status. For storeroom sales it also checks expiry and unreserved stock. A price change requires an explicit basket update. Drafts do not reserve stock.
- A single database transaction posts the sale, immutable receipt lines, storeroom deductions (if any) and cash ledger entry. Shelf balances are never deducted. Cash added is the recorded sale total, using any explicit sale-only price differences. Failure rolls back the whole operation.
- Request keys prevent duplicate effects after retries. The browser keeps a pending request in session storage before sending it. Local in-progress line edits are also saved in session storage. If its response is lost, reload, reopen the original shop's sales screen and choose **Retry pending sales request**. Keep that browser tab/session until resolved. This is request recovery, not offline selling or a durable offline queue.
- Only admins can set the first opening balance and issue refunds. Assigned employees can start later days using carried cash and record daily counts.
- Refunds reference the original receipt and paid price, cannot exceed the remaining quantities, and require sufficient recorded cash in the selected shop drawer. They never overwrite the sale.
- Returns default to quarantine: they are recorded but excluded from sellable stock. Explicit admin confirmation is required to restock an unexpired original batch at its original source. Physical quarantine, inspection and disposal remain operator responsibilities; a quarantine warehouse/release workflow is not implemented.
- Posted sale, refund and cash records cannot be updated/deleted through ordinary database operations. Drawer identity/opening amounts and finalized baskets are protected. Mutations have immutable operation and audit records.

## API

All paths below start with `/api/shops/:shopId/sales`. All writes need the session cookie, CSRF headers, `requestKey` UUID and a meaningful `reason`.

| Method and path | Purpose |
| --- | --- |
| GET `/workspace` | Optional `q` (up to 120 characters) ranks/filters sellable choices, own saved baskets, open drawers and latest 50 receipts |
| POST `/drawers` | Admin opens A or B with `openingMinor` and `openingSource` |
| POST `/drafts` | Create original-shop basket with `shopConfirmed: true` and `locationStatus` |
| POST `/drafts/:id/lines` | Save up to 100 unit/batch/source lines with `expectedVersion` |
| POST `/drafts/:id/state` | Park, resume or discard with `expectedVersion` and shop confirmation |
| POST `/drafts/:id/checkout` | Cash checkout with version, drawer, tender and shop confirmation |
| GET `/receipts/:id` | Original receipt and linked refund history |
| POST `/receipts/:id/refunds` | Admin quantity-based refund; quarantine or explicitly confirmed restock |

Amounts are integer pesewas. Each transaction is limited to 100,000,000 pesewas (GHS 1,000,000); quantities/conversion products are bounded too. Line writes accept at most 128 KiB. A receipt number is unique but may have gaps after rolled-back transactions.

## Upgrade and verification

Stop the local API before `npm.cmd run db:migrate -w backend`, then restart `npm.cmd run dev`. Migration 005 preserves existing accounts, catalogue, stock and supplier receipts. Never rerun development setup to upgrade existing data.

`npm test` includes upgrade preservation, shop/actor isolation, atomic stock/cash posting, stale prices, reservations, concurrent overselling, replay protection, original-price refunds, refund caps, permissions and immutable records. After building, `node scripts/test-sales.mjs` runs the isolated mobile browser regression without touching local shop data.

## Still planned

The current flow implements denomination counting, a sales-report cutoff, final lock-up, expenses, withdrawals and owner review; see [CASH_CONTROL.md](CASH_CONTROL.md). Previous-day drawers reject normal sales/refunds until closed and replaced with a current-day session. Historical dates remain unchanged. Sprint 7 adds offline storage/synchronization, installability and the 20:30 warning. Larger catalogue/receipt browsing, physical phone testing, deployment validation and independent cash/stock reconciliation remain release work. Recorded cash is expected cash, not evidence of the physical contents of a drawer.

Sale-only price exceptions preserve normal line prices and actual line totals, staff and time. Daily cash shows these differences. Partial refunds use the original actual paid line total, with cumulative integer rounding so all quantities refunded together equal that total.

Adding a medicine clears and refocuses search. Source and price checkboxes share one line. Shop confirmation is once per login/shop selection. Held tickets on the counter show their medicines and resume directly. Sign-out and administration are under Account; everyday tools use the bottom navigation bar.

Sales confirmed after cutoff receive the next reporting date but retain their physical cash date. This prevents double counting cash carried into tomorrow. See CASH_CONTROL.md.
