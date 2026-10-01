# Pharmacy money, pricing, and stock controls

Updated after reviewing readme.md and the owner's clarifications on 2026-10-01. No application code is present. These are design requirements, not confirmed code vulnerabilities or completed software fixes. Original brainstorming remains in the README, followed by confirmed operating rules that take precedence.

## Specific corrections to the README design

### 1. Counting while sales continue

The calculation button must start a reconciliation session for a specific shop and drawer. It must not change the business date of sales or silently move sales into tomorrow's revenue.

- Save the authenticated counter, shop, drawer, opening float, cutoff timestamp, and last included committed ledger sequence. Compute the expected balance on the server from those exact records.
- Use separate states: counting, submitted, reviewed, and closed. Repeated clicks must return the existing active count for that drawer rather than create competing closings.
- A denomination count records denomination multiplied by quantity, currency, and a count timestamp. Record the total automatically; staff must not overwrite the computed expected balance.
- Confirmed workflow: isolate drawer A for counting and route subsequent cash sales/change to drawer B. Record B's opening float and source; any float taken from A is an explicit paired transfer before A's cutoff, not another opening amount invented independently. Keep A unavailable for new sales during counting.
- Track every subsequent refund, withdrawal, and transfer by its actual drawer. At departure, count B and any cash remaining in A separately, then sum their reconciled balances for the shop. Preserve each drawer's variance; an overage in B must not hide a shortage in A. Offline drawer changes must follow the assigned-device/session rules below.
- Record money handed to the owner or bank as a transfer with a recipient acknowledgment. Record the money retained as the next opening float, linked to the previous closing record; do not recognize it as new income.
- Keep post-cutoff sales on their actual business date. Tomorrow's reconciliation may display them in a labeled “Previous-day sales after count” section, with the original dates. Include them once in reconciliation, never twice in revenue. Use labels as well as color.
- Display separate figures for recorded sales, expected cash, counted cash, money handed over, retained float, and variance. A staff-entered count does not change sales totals.

Example: drawer A opens with 100, receives sales of 600, and pays expenses of 50. Transfer 50 to start drawer B before counting A. A's expected balance is 600; a count of 590 reveals a shortage of 10. B receives later sales of 80 and should contain 130. Counting 130 in B gives combined counted cash of 720 against expected cash of 730. Handing over 600 leaves total retained cash of 120, allocated explicitly to the next drawer sessions. Sales remain 680; the float transfer is not revenue.

### 2. Two shops and switching locations

Every sale, payment, count, and withdrawal needs an immutable shop identifier. Stock movements preserve source/destination ownership, including shared main storage. Staff can switch only to shops they are authorized to access. Always display the active shop, but switching the display must never move existing transactions.

An open basket belongs to its original shop. Before switching, require the user to finish, explicitly discard, or park it in that shop. After switching, newly opened drafts and the drugs entered into them belong strictly to the newly selected shop. Returning to a parked draft must clearly show its saved shop and restore that shop context before editing. Drawer sessions also remain with their original shop. Financial and stock permissions must be checked on the server, including requests made outside the normal interface. Show shop totals separately and a combined owner view without counting inter-shop transfers as sales.

Owner clarification: check device location when opening a new sale draft to help staff verify the selected shop. If location is off, permission is denied, or a usable location cannot be obtained, display: “Location is unavailable. Check that you are selling at [selected shop] before continuing.” Give staff explicit actions to confirm the selected shop or change it before opening the draft. This is a warning and confirmation flow, not a requirement to enable location.

If an available location appears inconsistent with the selected shop, warn and offer the same confirm/change actions. If accuracy is too poor to distinguish the shops, say location could not verify the shop rather than claiming a mismatch. Configure each shop's coordinates and an appropriate proximity tolerance before enabling this comparison. Never silently switch shops based on location, and never move a saved draft because the device's location changes.

Record the draft's selected shop, creator, creation time, location-check outcome, and any warning acknowledgment. Location is an advisory check, not proof of attendance or authorization; enforce shop access independently on the server. Request location only for the draft-opening check, without continuous employee tracking or retaining raw coordinates by default.

### 3. Separately calculated drug categories

Separate category reports are useful, but excluding a category's receipts from drawer reconciliation hides money. Include all money that physically enters a drawer in that drawer's expected balance, regardless of reporting category. If a category uses separate physical cash storage, give it a separate account/drawer.

Use one financial reporting category per sale line so category totals sum to the overall sales total. Additional overlapping tags may be used for search, but not added together as financial totals. Save the category at the time of sale so later recategorization does not silently rewrite historical reports. Hiding a price behind a Show button is a display choice, not an access-control mechanism.

### 4. Days when staff do not use the app

An admin-approved exception day creates a tracking gap that software cannot fully verify. Record its shop, start/end time, authorizing admin, and reason. Require opening/closing counts, cash sales totals, withdrawals, refunds, and supporting manual receipt references. Mark the report as “Manual — item-level tracking incomplete.” Offline operation is not an exception day: itemized records must still be saved locally.

Use numbered manual receipts where possible. Later entry must link to the original manual record and replace or allocate its totals without adding the same sales twice. Do not invent drug-level stock deductions from an aggregate money total. Require a stock count or itemized backfill to reconcile inventory, and visibly flag outstanding reconciliation. Do not retrospectively turn a normal day into an exception to hide a shortage.

### 5. Personal spending and money leaving the shop

Record the amount, account/drawer, shop, person, actual time, reason, and approval. Distinguish business expenses, owner withdrawals, and staff advances; they should not all reduce reported business profit as expenses. A request does not reduce cash until money is actually disbursed. Record approval and disbursement separately, and surface any emergency unapproved disbursement for review without hiding its effect on expected cash.

### 6. Receipts, stock rooms, and direct-to-retail deliveries

Confirmed storage structure: shared main storeroom rooms 1 and 2 supply both shops. Each shop also owns a separate shelf/retail location and a storeroom location. Main storage belongs to the shared business, not arbitrarily to either shop. Stock movements record source and destination locations and their ownership; shared-storage movements need not have a selling shop. A delivery can be split across locations, and allocation quantities must equal the accepted delivered quantity.

Both shops can sell directly from their own shelves or their own storerooms. Record the source on each sale line, split quantities when sourced from both, and deduct each quantity exactly once. A direct storeroom sale must not also post an imaginary storeroom-to-shelf transfer. Main-storage supply to either shop is a transfer, not customer revenue. A shop cannot sell shared main-storage stock as its own before its transfer is received.

Switching shops displays only the selected shop's operational stock and storeroom records, subject to permissions. Authorized owner reports may combine shops while retaining each location's identity. Switching shops never reassigns existing stock or movements. Validate source and destination locations and shop permissions on the server for receiving, sales, adjustments, and transfers.

Moving goods from a shop's storeroom to its retail location is a recorded internal transfer, not a sale or a new supplier delivery. Moving goods to another shop is an explicit inter-shop transfer with dispatch and receipt records. Preserve both shops and locations on the transfer, and include stock in transit once in combined inventory.

Preserve the supplier's promised/invoiced quantities separately from actual received quantities. A mismatch needs a discrepancy record and reason; the confirmation screen must not overwrite the original receipt to make it appear correct. Attach the supplier reference and record who received and approved the delivery.

Direct-to-retail deliveries must still enter the stock ledger at the retail location. Otherwise stock can disappear without an expected balance to compare against. A sale deducts from its actual source location, including sales fulfilled directly from storage.

Transfers must move goods between locations without creating or destroying stock. If collection and receipt happen at different times, use dispatched, in-transit, and received quantities, with recipient confirmation and discrepancies. Reject negative stock and duplicate transfer submissions.

Store quantities in a consistent base unit with explicit conversions for carton, box, strip, container, or single. For example, 41 singles with 14 per carton display as 2 cartons and 13 singles. Those displayed values describe one quantity; they are not two independent balances. Preserve the conversion used on historical movements. Packaging that differs by supplier or batch needs its own conversion.

If theft detection is a core launch goal, basic receiving, retail stock deductions, transfers, and physical counts should be part of the first release. Deferring all inventory work leaves unrecorded sales much harder to detect.

### 7. Price search and the sales calculator

The “maximum 6 letters” search rule is ambiguous and could hide the correct drug. Proposed behavior: search the full query, rank exact matches first, then prefixes and other text matches, then clearly labeled spelling suggestions. Do not discard longer drug names because the query exceeds six characters.

Show strength, dosage form, brand/generic name, pack size, selling unit, availability, and approved price together. Highlight matched text, but never automatically substitute a spelling suggestion into the basket. Similar names can refer to different products.

Calculate quantity multiplied by the approved selling-unit price, then permitted discounts, using server-validated prices. Box prices may differ from single price multiplied by box size, so define each permitted selling-unit price explicitly. Save the price and unit on the sale. Before completing a parked basket whose prices changed, show the new total and require acknowledgment.

### 8. Suspicious totals and accountability

Flag exact reconciliation differences first: shortages, unexplained overages, unmatched transfers, missing closes, duplicate references, negative stock attempts, and incomplete manual days. Separately flag patterns such as repeated refunds, withdrawals, discounts, and stock adjustments for review.

An unusually high sales total alone is not proof of theft, and a plausible total is not proof that all sales were recorded. Show the expected amount, observed amount, difference, related transactions, and review status. Record reviewer and resolution without deleting the original flag or variance. An admin-set alert threshold can prioritize review, but every variance remains visible.

Dates must include a configured shop timezone, business date, and actual timestamp. Online records use server timestamps; offline records also preserve device time, device sequence, session, and later server receipt time as described below. Define the business-day boundary independently of the 8:30 p.m. warning. Sending a report to the admin should happen after a durable save, with delivery status and retries; notification failure must not lose the closing report.

### 9. Cash-only payments and price permissions

Customer checkout accepts cash only. Require cash tendered to cover the sale and calculate change; the drawer increases by tendered minus change. No credit or electronic-payment checkout is in scope. Owner handovers and bank deposits remain recorded movements of business funds, not customer payment methods.

All admins can change prices. Employees need an explicit price-change permission scoped to authorized shops. Only admins grant/revoke that permission, online, with an audit trail. Price permission does not grant discount, refund, stock adjustment, or withdrawal authority. Proposed default: prices belong to a shop; an admin may explicitly update both shops in one audited operation. Do not silently propagate an employee's price edit to the other shop.

Save old/new price, product and selling unit, shop scope, actor, reason, version, and server effective time. Use version checks so concurrent price edits cannot silently overwrite each other. All price edits require connectivity and server acknowledgment, including admin edits. Offline sales use their downloaded approved price version; label it as potentially stale. Uploads preserve the price actually charged and flag stale prices or invalid authority for review rather than rewriting receipts or losing the sale. Record and surface large reductions and repeated price changes to the owner.

### 10. Durable offline sales and synchronization

The owner's offline-save-and-upload approach is adopted with these safeguards. A disposable page cache alone is not the transaction store. Use a transactional local database and a durable upload queue; select the implementation once the target platform is known.

**Local completion and recovery**

- Provision and authenticate a device online before offline use. Save its device identity, authorized staff/shop scopes, approved catalogue, and bounded offline authorization. Define the authorization expiry before launch; an offline device cannot learn about an immediate remote revocation.
- Give every completed sale an immutable unique operation ID and a device-local sequence. Include shop, drawer/session, staff, source location/batch, base quantity and selling unit, price version, cash tendered, change, business date, and local time. The server also records receipt time; flag clock anomalies without moving revenue to the upload date.
- In one local transaction, save the receipt, local stock consumption, cash movement, and upload-queue entry. Display success only after commit. Autosave unfinished baskets separately; they are not sales. If saving fails or storage is full, do not claim a sale was recorded; use numbered manual records for any trade that proceeds.
- Keep pending data across restarts, account logout, and app upgrades. Lock access on logout instead of deleting the database. Do not provide a reset or device reassignment that discards pending entries. An app cannot prevent device loss or an external wipe; provide controlled encrypted recovery exports and manual-receipt recovery procedures, with the same operation IDs on reimport.

**Upload and integrity**

- Retry automatically on launch, resume, successful server reachability, and periodically while active; provide a Sync now action. Network connection alone is not proof the server is reachable. Use backoff and retry after partial failures.
- Send immutable operations, not a replacement copy of a shop's balance. The server stores operation IDs uniquely and posts sale, cash, and stock atomically. A retry of the same ID and content returns the same result; the same ID with different content is a conflict, never an overwrite.
- Retain the local record until the server durably acknowledges that operation. A lost response after server commit must result in a safe retry, not a duplicate. Track pending, uploading, acknowledged, and needs-review states per record; distinguish acknowledged ledger postings from records merely received into a review queue.
- Upload dependencies in order, such as a drawer opening before its sales. Do not silently discard invalid or conflicting entries representing goods/cash already exchanged. Preserve them in a review queue, expose their amounts separately, and resolve through audited postings/corrections. Do not use last-write-wins for financial or inventory history.
- Show pending counts and cash amounts, unresolved conflicts, and last successful sync on the device. Server reports must show their completeness and last contact per participating device. A device with internet can still have unsynced records because of an expired login or server failure.

**Stock and drawer concurrency**

- Disconnected devices cannot coordinate a live shared stock balance. Proposed strict default: allocate exclusive sellable quantities by product, batch, and location to each offline-capable device while online, reserving them from all other devices and transfers. Decrement allocations locally; block excess quantities. Release/reallocate only after the owning device reconciles, not merely because a timer expired.
- A device may hold allocations for both shelf and storeroom stock, but must use the actual source on each line. Shared main-storage and inter-shop dispatch/receipt postings require connectivity in the first release. If goods physically move during an outage, keep numbered movement evidence and hold incoming stock unavailable until verified receipt; do not bypass stock reservations.
- Assign each cash drawer session to one recording device before offline work. Staff may authenticate individually on that device. Multiple independently offline devices cannot share the same active drawer session. Pre-provision A/B drawer assignments and B's float before going offline, or record the A-to-B float transfer atomically on their single owning device at the counting cutoff.
- Offline refunds and controlled stock/permission/price changes require online validation in the initial design. For an unavoidable physical cash outflow during an outage, save the actual movement and reason locally as pending approval so expected cash remains honest; approval must not post that outflow a second time.

**Closing and late uploads**

- Offline counting freezes the local session sequence; it does not claim a server-wide cutoff. Record the cutoff and local operations covered by each count. Reconcile A and B separately, including their linked float transfer.
- Allow a locally saved provisional count during an outage. Final server closing requires all registered devices that participated in the shop/day to upload through declared closing sequences, all required counts, and resolution of material conflicts. Unknown/missing devices and incomplete uploads keep the report incomplete.
- If a late record affects an already reviewed report, preserve the prior version and issue an audited revised reconciliation. Retain the original sale date and cash count; never silently rewrite the historical report or count the upload as a new sale.

### 11. The 8:30 p.m. warning

Use 20:30 in each shop's configured timezone, not a hardcoded device timezone or UTC. At that time, warn when the server cannot be reached OR the device has pending records or unresolved sync errors. Warn even if there are no pending records but connectivity is unavailable, as requested.

Suggested message: “Connection or sync needs attention. [N] sales totaling [amount] are waiting to upload for [shop]. Last successful sync: [time]. Connect to the internet and keep the app open until synchronization finishes.” If there are conflicts rather than pending uploads, show their distinct review status. Provide Retry sync and Acknowledge; acknowledgment never clears pending records or marks a report complete.

Evaluate the warning while active and immediately on resume/open after 20:30 if it was missed. Keep a visible outstanding-sync banner and record delivery/acknowledgment by shop business date. Cover each shop with pending records on the device, not just the shop currently selected. An online server may separately flag missing device contact or incomplete daily reports to admins; it cannot know the exact contents of an offline device's queue.

Exact notification delivery at 20:30 when the app is closed, suspended, or the device is off is not guaranteed. Select and test platform-supported local notifications if closed-app reminders are required. Browser background sync has limited availability and periodic sync timing is browser-controlled; always retain the launch/resume/manual retry paths. See [MDN background sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) and [MDN periodic background sync](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API).

For a browser app, request persistent storage and handle denial/quota failures. Browser-managed data can otherwise be evicted; persistent storage does not replace server sync or recovery planning. See [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Additional acceptance checks from the README

- A sale completing at the counting cutoff belongs to exactly one interval, determined by server ledger order online or the owning device's committed session sequence offline.
- Two employees starting a count simultaneously cannot create two active closings for one drawer.
- Sales after counting remain on their original business date and appear only once in revenue.
- A shortage at the first count remains visible after later sales and float carryover.
- Switching shops does not relabel an open basket or move an existing drawer session.
- After switching shops, a new draft and every sale line entered into it are saved only under the newly selected shop.
- Opening a draft with location disabled, denied, timed out, or unavailable shows the selected-shop warning and requires staff to confirm or change the shop.
- A location mismatch warns without automatically switching shops; an imprecise location is treated as unverifiable.
- Resuming a parked draft restores its original shop context and cannot save its items to the currently selected different shop.
- Separate category subtotals match total sales while all cash categories remain included in drawer reconciliation.
- An exception-day backfill does not duplicate previously entered manual totals.
- Split deliveries and transfers conserve quantities across all locations, including retail and in-transit stock.
- Each shop's storeroom and retail balances remain separate; switching shops cannot expose unauthorized records or reassign stock.
- Storeroom-to-retail transfers reduce the source and increase the destination without creating sales or changing combined stock quantity.
- A misspelled query presents suggestions without automatically selecting a different drug or strength.
- A mixed shelf/storeroom basket deducts only the specified source quantities; supplying either shop from main storage creates no sales revenue.
- Drawer A's shortage remains visible even if drawer B has an equal overage; B's initial float is not counted as revenue.
- Cash tendered minus change equals the sale total; unsupported payment methods and credit checkout are rejected.
- All admins and explicitly permitted employees can change prices within authorized shop scopes; an ordinary employee cannot. Offline edits cannot activate a new price.
- A restart after local sale commit preserves the receipt, stock consumption, cash movement, and pending upload together.
- A server commit followed by a lost acknowledgment and repeated uploads produces one posting. Reusing its ID with altered contents raises a conflict.
- Storage failure never produces a false saved receipt; logout and updates preserve pending operations.
- Offline devices cannot exceed their exclusive stock allocations, and online devices cannot consume those reserved quantities.
- A stale-price sale keeps the actual amount charged and appears for review; a conflicting sale is never silently dropped.
- Late uploads preserve the original session/date and revise reports through an audit trail without duplicating revenue.
- Final closing is prevented when a participating device has not reconciled or unresolved postings remain.
- At 20:30 shop time, an unreachable server triggers a warning even with an empty queue; reachable internet with failed uploads also triggers it.
- Opening the app after 20:30 shows a missed warning, including pending records belonging to a shop other than the active one.

## Purpose

Help staff find the correct drug price quickly, record every sale and stock movement, and show where the business's money went. Make discrepancies visible and preserve evidence for investigation. Software cannot prevent all theft, especially if goods or cash change hands outside the app; physical counts and independent review remain necessary.

## Gaps to address before building

| Possible loophole | Required control |
| --- | --- |
| Staff sell goods without recording the sale. | Reduce stock for each completed sale, issue numbered receipts, and compare physical stock with recorded stock regularly. Require explanations and review for differences. |
| Someone changes a drug's price or gives an unauthorized discount. | Restrict price changes and discounts by role. Record old/new values, reason, approver, and effective time. Save the actual unit price and discount on each sale so later price changes cannot rewrite history. |
| Cash leaves without an explanation. | Record every expense, withdrawal, supplier payment, refund, and bank deposit with category, amount, source account, actor, time, reference, and supporting evidence where available. Require independent approval for sensitive movements. |
| A sale is deleted or changed after cash is received. | Never delete or edit posted financial transactions. Correct them using linked reversals and replacement entries, preserving the original. |
| Fake refunds or cancelled sales hide missing cash. | Link refunds to original sale items, cap cumulative refunds at the refundable amount, require approval, and track whether returned stock is safe to sell separately from the refund. A cancellation after payment needs a recorded payment reversal. |
| A transfer is mistaken for an expense or income. | Record transfers as linked movements between accounts. A deposit reduces drawer cash and increases bank or deposit-in-transit funds; it does not create another sale or expense. Reconcile settlement. |
| A failed or repeated request creates extra sales or charges. | Commit sale, payment allocation, stock movement, and ledger entries atomically. Use unique request identifiers and transaction references to prevent duplicate posting on retries. |
| Two staff sell the same remaining stock. | Validate available stock and reserve/deduct it within the database transaction. Reject insufficient stock even when requests arrive simultaneously. |
| Staff complete an unpaid sale using an unsupported payment method. | Accept cash only; require sufficient tender and record change. Do not permit electronic payments or credit checkout. |
| Staff share a login or approve their own adjustment. | Give each person a login. Enforce permissions on the server for every action and record the actual actor. Prevent self-approval for controlled actions. |
| Staff change opening cash or backdate entries to hide shortages. | Record counted opening cash and closing cash for each drawer/shift. Lock reconciled periods; record actual posting time separately from any authorized business date. Audit reopening and adjustments. |
| A pack/tablet mix-up creates incorrect prices and stock. | Define selling units and pack conversions explicitly. Store stock in a consistent base unit and show the chosen unit next to quantity and price. |
| Damage, expiry, or stock deliveries are manipulated. | Record receiving, supplier returns, expiry, damage, and count adjustments as distinct stock movements with reasons and review. Track batches and expiry dates. |
| Logs or records disappear. | Use append-only audit records with restricted access, backups, and tested restoration. Send audit copies to storage the ordinary app account cannot alter. Application logs alone cannot protect against a database administrator. |

## Money reconciliation

Maintain separate balances for each cash drawer and business-fund destination used for owner handovers or bank deposits. Customer payments are cash only; credit and mobile-money checkout are out of scope.

For each account and reporting period:

`Expected closing balance = opening balance + confirmed inflows - confirmed outflows`

For a cash drawer:

`Expected closing cash = opening cash + cash payments received + transfers in - cash refunds - cash expenses - withdrawals - transfers out`

`Cash variance = physically counted closing cash - expected closing cash`

Negative variance means a shortage; positive variance also needs explanation. Never silently adjust the expected balance to match a count. Record the variance, reviewer, explanation, and any approved adjustment separately.

Example: opening cash 200, cash sales 500, cash expenses 50, and a bank deposit of 300 produce expected drawer cash of 350. A count of 330 produces a shortage of 20. The deposit is a transfer, not an expense.

Keep these figures distinct on the dashboard:

- Sales, discounts, and refunds.
- Cash received net of change, by shop and drawer.
- Pending offline sales and unresolved uploads, clearly separated from server-posted totals.
- Expenses, owner withdrawals, and internal transfers.
- Expected and reconciled balances for each account.
- Stock value, cost of goods sold, and profit; these are not interchangeable with cash available.

Use integer minor units or fixed-precision decimals for money, with explicit currency and rounding rules. Never use binary floating-point amounts for financial calculations. A posted transaction must balance; closing balances should be reproducible from the ledger rather than editable totals.

## Price lookup and sales workflow

1. Search by drug name, generic name, strength, dosage form, or barcode.
2. Show the exact product, selling unit, approved price, available quantity, and expiry/batch information clearly.
3. Let staff select source location, quantity, and permitted discounts; calculate from approved price versions locally and validate on the server. Preserve offline prices actually charged.
4. Record cash tendered and change. Require full cash payment; no split electronic payments or credit checkout.
5. Save the sale, cash movement, stock deductions, and upload entry together locally, then post atomically on the server with duplicate protection. Issue a uniquely numbered receipt and show its sync status separately.
6. Keep completed sales searchable for receipt reprints, controlled returns, and investigation. Reprinting must not post another sale.

Price lookup assists staff with prices; it does not provide clinical prescribing or drug-substitution advice.

## Suggested access roles

| Role | Typical permissions |
| --- | --- |
| Cashier | Look up prices, record sales, print receipts, and submit refund or adjustment requests. |
| Employee with price permission | Cashier capabilities plus audited online price changes for authorized shops. No permission grants or historical receipt edits. |
| Stock clerk | Receive stock, inspect batches, and submit stock adjustments. No unrestricted cash access. |
| Admin | Change prices, grant/revoke employee price permission, and manage authorized shops. Other sensitive powers remain explicit permissions. |
| Manager | Approve permitted discounts, refunds, expenses, and stock adjustments; review shifts. Cannot approve their own controlled requests. |
| Owner/reviewer | Review all balances and audit trails, set policies, and review exceptions. No ability to silently rewrite posted history. |

For a small shop where independent approval is unavailable, explicitly mark such actions as exceptions and surface them for later independent review. Do not pretend self-approval is independent review.

## Checks the implementation must pass

- An employee without price permission cannot change prices. No employee can post an unauthorized withdrawal or grant themselves a higher role through direct API calls.
- Repeating the same sale request creates one sale, one stock deduction, and one financial posting.
- A crash during posting leaves either the complete transaction or no transaction.
- Concurrent purchases cannot oversell the last unit.
- Changing a product price leaves historical receipts and totals unchanged.
- Multiple partial refunds cannot exceed the original refundable quantity or amount.
- Unsellable returns do not increase sellable stock.
- A bank deposit preserves combined funds across accounts and is matched to bank receipt.
- Underpaid or noncash checkout cannot be posted as a completed cash sale.
- Cash closing exposes shortages without overwriting expected cash.
- Each correction retains its original record, actor, reason, and approval history.
- A backup can be restored and its financial and stock totals reconciled.

## Details needed from the owner

- Currency, shop timezone/business-day boundary, and device platform (browser, desktop, or mobile).
- Number of selling devices per shop, drawer/device assignments, and acceptable offline authorization duration.
- Who may approve refunds, disburse withdrawals, adjust stock, and review daily counts.
- Return rules and exact pack/strip/container/base-unit conversions.
- Whether approved selling prices should always match across shops; the current proposed default allows explicit shop-scoped prices.

Start implementation with the product/price catalogue, authenticated roles, stock ledger, sales and payment ledger, recorded outflows, and daily reconciliation. Add supplier balances, purchasing, expiry alerts, and further reports once the core balances reconcile reliably.
