# Daily cash and closing

Use **Daily cash** on the navigation bar. Records are separate for each pharmacy, in GHS and GMT.

1. **Start day:** the first physical opening balance requires an administrator. Later days automatically carry the last actual lock-up balance.
2. **Count notes:** enter numbers of GHS 10, 20, 50, 100 and 200 notes being sent. Line subtotals and the total update immediately. Smaller money stays as change. The local counting draft survives navigation/reload; it is not a submitted financial record.
3. **Finish today's sales:** press this once when setting the day's sales cutoff. Counting can begin beforehand, but cannot be submitted before this button. No float, drawer change or advance allocation is required.
4. **Keep counting:** other employees may continue selling. After-cutoff sales stay on the same day's report and add to available change. Note quantities remain editable; if later cash is sent, include it in the note counts.
5. **Submit final count:** submit the note counts, selected sales date and all cash physically left together. This atomically records money sent and final cash left, then closes the shop day. There is no separate change-at-cutoff field or second closing checkpoint.

Physical reconciliation uses opening cash + today's sales + extra change brought in - refunds - money out - money sent. Compare this with the actual cash left; actual cash becomes the next opening balance.

Example: opening 100 + sales 200 + later sales 30 = 330. Send 250 and leave 80, or update the note counts to send 270 and leave 60. Today's sales are 230 in both cases; tomorrow starts with the actual amount left.

Use **Money out** to record an amount and reason. This deducts cash immediately with the actor and time recorded; no request, approval or payee is needed. Differences require investigation, not an automatic allegation of theft. Owner reviews never rewrite counts.

## Controls

- Authenticated shop access, CSRF, idempotency keys and immutable records protect submissions.
- Cutoff and checkout serialize through shop locks. New sales retain the physical business date as their reporting date; stock and cash post atomically.
- Sales before and after the cutoff remain on the same physical business day. Historical reporting-date audit rows remain immutable; current reports use sales.business_date.
- Lost-response requests retain their original retry key. The counter also supports durable offline queues; final cash submission still requires connectivity and synchronized selling devices.
- Local note drafts are scoped by staff, shop and physical date. The first submitted count wins; another device cannot overwrite it.
- Migration 010 preserves original historical reporting dates and old drawer-based counts. New cutoffs do not move money. Legacy APIs remain internal compatibility features.
- See OFFLINE_SALES.md for offline queue behaviour and reconciliation limits. Broader owner reporting remains future work.

## API

Exception dates and outside change are inside Daily cash for admins. Set an exception date before that shop has sales or a cutoff/closing (today or future). On that date, price lookup remains available but individual ticket checkout is blocked. Record one daily sales total, including zero, before the cutoff. Continue the normal note count and final cash-left workflow. The total contributes to sales and cash once without fabricating medicine/category quantities. Final actual cash still carries forward.

Extra change brought in is an admin-only cash inflow, separate from sales, available while today's shop cash session is open, including after cutoff. Expected cash includes this inflow; retry keys prevent double counting. Migration 013 adds immutable exception totals and the cash_in ledger kind.

Under /api/shops/:shopId/day:

- GET / returns physical cash totals, today's sales-report total, carried late sales, next-day sales, count and closings.
- POST /open carries previous final cash or sets the initial balance.
- POST /start-count sets an immutable sales cutoff and cash snapshot. A nonzero legacy transferMinor is rejected.
- POST /send requires an existing cutoff, exactly five distinct denominations, finalLeftMinor and optional salesDate (defaults to today in GMT).
- POST /send with finalLeftMinor records remittance and closing atomically. Legacy POST /close completes an older separate remittance; POST /review adds an administrator review.
- POST /exception-date takes businessDate; POST /exception-total takes salesMinor. Both require admin access.
- POST /money-in takes amountMinor and requires admin access. These writes also require requestKey.

Price differences retain normal and actual amounts, seller and time. Above/below direction is computed automatically; no explanation is requested or inferred.

Counting permission is configurable per employee/shop. An assigned employee without it must tick **Count without permission** for cutoff, remittance and final count; the server records the override and actor. No reason is required. Administrators always have counting access. Activity and price-change history are inside **Account > Activity reports**, protected by admin-only APIs. Migration 011 adds these permissions without altering old counts.

Migration 012 removes the recipient requirement and adds the selected sales date. created_at remains the real submission time. POST /api/shops/:shopId/cash/money-out accepts amountMinor, reason and requestKey; a retry with the same key cannot deduct twice. Gross sales are preserved; cash reconciliation subtracts the outflow. Money out remains possible after the sales cutoff until physical lock-up.
