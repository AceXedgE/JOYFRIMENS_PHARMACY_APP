creating an app for tracking ongoing sales and calculates the total of the day after calculation
an inside calculator that tell to the total of the drugs
also serves as drug price checker(when some one has to check for the price of a drug all the have to do is search it in the app)
there wil be a filter to a fast search for fast look up(take note that there could be a mispellings in there, so 
    the filter will work like;
    highlighted typed litter from results
    first comes acurately spelt drug
    then comes with the drugs with the maximum amount of letter within the search box(maximum will be 6 before it is filtered out)
)

the tracking part will work like;
    the name of the drug and the amount amount being bought
    NOTE: some drugs will come with a choosing of whether it is box or just a single container
    since amount of price is saved at the admin it shows up and update per amount being bought(simple arithmatics)
    and multiple drugs can be bought per time so there will be a button to open somekind of space before you choose the drugs and amount. The prices will still show anyways and a total too will show underneath after choosing the drugs

there will be someone dedicated for calculated the amount at the end of the day, the moment that button is pressed then total amount sold that day will be calculated behind the scenes and sent to admin.(this button will be available for everyone but the name of the personel will be sent as part of the the total amount sent to the admin)
- said person is required to also send the total amount to admin
    the total amount per every note and the total will be calculated automatically 
    the total amount left behind before calculation started
    the total amount there before leaving

what this does is when the calculation is above the amount supposed to reach, it is to check if the amount left behind is the cause of it(take note that even though the button is pressed and the amount is sent to the admin, a personel could still be selling so it will still take track of those, compare the amount with the amount left before leaving, store the difference with repect with to the drugs sold after the button for 'time to calculate the overall amount for the day' is pressed and save the amount left as possible chnage for the next day)

the drugs sold after the button is pressed will be added to the total amount sent the next day in a different color while the actual total for the next day is also shown, and the amount calulated buy the button presser should reflect on the total

there should also be a way for the total amount to be flagged when the amount looks suspicious, cuz its normal for the amount to go over a certain amount but at the end they are all tracked so if the amount looks like its missing some values the app should be able to detect it on the admin side.

there should be a place within the app save amount taken to do something personal(bought something during the day and the amount that was taken)

when the categoriesed are enabled to be calculated seperated it will be calculated seperatedly. it will not be added to the others it will have its own category, it will show every drug that was bought and the amount and the price hidden behide a show button
where the total is calculated and shown

the date too must show and is very important expecially day

- admin side
 a place where you can save new drugs and price
 prices of the drugs can be updated by all admins and employees explicitly given price-changing permission. Every change keeps the old price, new price, person, shop scope and time. No reason is requested; history is admin-only. The drugs can be made unavailable with a check box(or something)
 there should be a way to create a category for specific drugs which can be added manually with a check box;
 same for the normal drugs being sold.
 

later addons:
 there will also be a place for newly arival drugs from souces and amount promised 
 the fields will be the name of the drug, whether its a carten or singles amount given and price of one
 this will be stored as reciete

 there is another reason for storing this, the name of the drugs, the carten(if carten, they must indicate the amount in one carten) or singles will be stored in a place called store room and every time they physically go to the store room to go and take any, the amount they take is they input will be subtracted from the storeroom so we know the amount left in the store room
 if the amount they take from the store room is singles but the one in the store room is a carten, it will take one carten(since we already know the amount in one carten) and subtract the singles from the one carten. so note will be amount available: carten : 2 singles : 13;  1 carten = 14(this is just an example to get my proint across)

 its not always the the boxes are sent to the storeroom so it will not be sent there straight up, when the reciet comes in admin will choose whether to save it as whether it it came to store room or pharmacy store room. yes, the pharmacy will also have its own store room. which will work just like the main storeroom. though some drugs taken from the main store room can be stored in the pharmacy store room.(take note in case we have to do something about it)

 with the reciet some can be sent straight to retail.. so take note that the one we will be using to calculate the amount is left in store is the ones saved in the store room. take note that this in accuracy will be more within the pharmacy storeroom (the comparison must be made between the reciet and the amount stored at the store room)
 first is a button to confirm if the amount from the reciet and the the amount the reached the store room is accurate
 second is for the app to ask if they want to make changes to the app before saved to store room
 third is to choose if to save it at the what store room?

 NOTE: there are two rooms for the main store room, so if the there should be a way to whether choose all for store room 1 or some would be sent to store room 2. there should be a radio button or something to whether save all for room 1, 2 or custom. this is where they are able to choose where which drug goes where

 and when some are been removed from the store room after being bought 


 NOTE: there can be exempted days where the the employees may not use the app cuz admin says so, so there has to be a way to for admin to do that in the app. but total is still needed to be provided to the store.
 also there are two two shops so the employee must choose where he or she is before he starts selling. wich can be changed anytime at the top of the app and must always be showing

Shop-specific sale drafts (clarification):
- Every shop also has its own storeroom. Only its storeroom quantities are tracked. Shelf medicines have a shop-specific unavailable flag, not a counted balance.
- Switching shops displays the selected shop's drugs, sale drafts, retail stock, and storeroom stock. Existing records keep their original shop.
- Moving goods between a shop's storeroom and its retail stock, or between shops, requires a recorded stock transfer; switching the selected shop never moves stock.
- Drugs entered into a sale draft are saved strictly under that draft's shop.
- After an employee switches shops, new sale drafts are saved under the newly selected shop. Existing drafts and completed sales keep their original shop.
- Verify the selected shop once per sign-in/shop selection, not per ticket. Retain verification across navigation and reloads in that browser tab. Switching shops requires confirmation again. Check device location at verification; never automatically switch shops.
- If location is off or unavailable, show a warning naming the selected shop and ask the employee to confirm that shop or change it before continuing. Employees do not have to enable location to proceed.
- If location suggests a different shop, warn the employee to verify the selection. If location is too imprecise, report that the shop could not be verified.
- Before switching with an unfinished draft, finish, discard, or park it at its original shop. Resuming it must restore and clearly display that original shop.

Confirmed operating rules (these take precedence over earlier brainstorming):
- Customer payments are cash only. Record medicines and their total; do not ask for normal tender/change. A sale-only price difference records the actual charged amount without requiring an explanation.
- The main storeroom, with rooms 1 and 2, supplies both shops. Each shop has an uncounted shelf and its own quantity-tracked storeroom.
- Each shop can sell from its shelves or directly from its own storeroom. Every sale line identifies its source. Deduct quantities only for direct storeroom sales; shelf sales record quantities sold and money, without a shelf stock deduction. A basket can include goods from both locations.
- Main-storage deliveries to a shop are recorded transfers, not sales. Track dispatch, receipt, shortages, and goods in transit.
- Counting does not require drawer selection, a separate drawer, or a change float. Staff may begin entering note counts before pressing the sales cutoff. Submission requires the cutoff. Later sales belong to the next reporting day.
- All admins may change prices. Only specifically permitted employees may do so, for their authorized shops. No explanation is required for price changes. Changing prices does not permit changing old receipts or granting permissions.

Offline operation:
- Save completed sales durably on the device, including their shop, drawer, staff member, stock source, quantity, saved price version, and cash/change. Show success only after the local save succeeds.
- Keep an upload queue and automatically retry when the app can reach the server. Keep each record until the server acknowledges it. Repeated uploads must never create duplicate sales.
- Always show offline/sync status, pending sale count and amount, and last successful sync. Unsynced shop totals are provisional, including totals sent to the admin.
- At 8:30 p.m. in the shop's configured timezone, warn if the server cannot be reached or records remain unsynced. Show any missed warning on the next app opening. Acknowledge does not mean synced.
- Keep local data across restarts, logout, and updates. Do not offer an app reset that discards pending records. Device loss or externally cleared storage can still lose unsynced records.
- Use the last approved downloaded prices offline, clearly showing that they may be stale. Price and permission changes require an online server acknowledgment; completed offline receipts are never silently repriced.
- Before offline selling, assign each drawer session to one device and allocate exclusive storeroom stock quantities to that device. Shelf sales do not need inventory allocations. Other devices cannot sell or transfer those quantities until released safely. Never assume two offline devices share a live stock balance.
- Offline closing counts are provisional until all participating devices sync and conflicts are reviewed. Record late uploads under the original sale session/date, not the upload date.
- Detailed offline controls and verification cases are in SYSTEM_REVIEW.md. Background sync and exact closed-app warning delivery depend on the platform and cannot be assumed.

Owner clarifications, 2026-10-16 (override earlier price-scope assumptions):
- The app will primarily be used on mobile phones, so catalogue lookup and price editing must be mobile-first.
- Both pharmacies always use the same drug price. A selling unit has one shared approved price across both shops; authorized edits affect both.

Owner interface clarification, 2026-10-21:
- This is a private tool for one company. Start directly at medicine search and prices, without an overview dashboard.
- Searching for a medicine must work without creating a sales ticket. Open a ticket only when a customer is buying; use the same search to add medicines and show their total.
- Keep the active shop and date visible. Use a navigation bar for Counter, Daily cash, Money out and Account. Put sign-out and permitted administration links in Account.
- Prioritize phone use and a restrained white, charcoal and blue palette.


Owner sales and cash clarification, 2026-10-21 (supersedes earlier shelf-counting assumptions):
- Open one ticket for each person buying. Do not ask for or store buyer details. Record the medicines, selling units, quantities, approved prices and sale total.
- Shelf quantities are NOT tracked. A medicine is available by default; staff may mark it unavailable in the selected shop and remove that mark when it is back on the shelf.
- The unavailable mark is for the shelf only. If usable stock exists in the shop storeroom or either main storeroom, show the specific storeroom names. Finding or receiving storeroom stock must NEVER clear a shelf's unavailable mark automatically.
- Track remaining quantities only in storerooms. Selling directly from a shop storeroom deducts that storeroom; a shelf sale must not depend on any inventory receipt, batch or quantity.
- Each shop has its own independent daily cash record. The previous final cash left in that shop becomes its next opening cash; do not mix the two shops.
- Staff count money being sent by denomination: GHS 200, GH?100, GH?50, GH?20 and GH?10. Notes and coins below GH?10 stay as change, and ARE included in the physical cash left behind.
- Record who sets the sales cutoff and when, the note counts, money sent and selected sales date, and change left at the cutoff. Sales continue without changing drawers, but belong to the next reporting day.
- The FINAL total cash left anywhere in the shop, including later-sale cash and smaller change, is entered LAST, after selling stops and immediately before doors are locked. It is separate from money sent and the earlier cash-left observation.
- Expected final cash = previous final cash carried in + today's sales + recorded new money added - refunds - recorded expenses/advances/withdrawals - money sent. Compare this to the actual final cash left. Internal drawer transfers do not change the shop total.
- Carry the actual final cash left into the next day, preserving any difference from expected cash for owner review. Include previous-day sales after cutoff in the next day's sales report, visibly distinguished. Their physical money is already in opening cash: never add that money a second time when reconciling cash.
- A difference indicates that records and cash need investigation. It does not by itself prove theft. Keep staff names, times, counts and money movements so the owner can compare related records.
- Prioritize making sales and this cash workflow correct and simple. Receiving stock will be revisited afterwards; existing legacy shelf balances are not a source of truth for sales.

Owner ticket clarification, 2026-10-21 (supersedes earlier checkout-screen assumptions):
- Default sale source is the shelf. The owner corrected the accidental statement that it was the storeroom. A per-item "Storeroom" checkbox selects a direct storeroom sale and its quantity deduction.
- Storeroom items must change colour so the seller can identify them visually. Use a pale blue background, blue edge and Storeroom label; restore normal styling when unchecked.
- Do not list medicines before the user types. Use the owner-notes ranked spelling-tolerant search with highlighted matches, both for price checking and inside tickets.
- One customer ticket is one modal overlay containing the search, selected medicines, editable quantities, remove buttons and live arithmetic total. Avoid separate add-item and payment dialogs.
- Record the medicines leaving. Normal sales do not ask how much cash the customer handed over, calculate change, ask for a drawer, or show receipt/printing controls.
- A "Price changed" checkbox handles exceptions: customer paid less but received the medicine, or extra money was retained because change was unavailable. Record the actual total charged for that medicine line only when checked. Do not require a reason; the owner can ask the seller in person. Preserve who sold it and the normal price.
- Preserve the normal approved price, quantity, actual amount charged, staff member and time. This is a sale-only price difference; it must not edit the shared medicine price.
- Daily cash must use the actual amount recorded, with price differences visible for review. The frontend updates the running total immediately; the backend still checks prices, permissions, quantities and exception direction before committing.
- Cash-session bookkeeping may remain internal for existing daily reconciliation, but drawer setup/selection must not be part of the seller's ticket flow. No receipt printing is exposed yet.

Owner speed and counting clarification, 2026-10-21 (latest operating rules):
- Adding a medicine clears and refocuses the search for the next medicine.
- Keep the short Storeroom and Price changed checkboxes on the same line, including on phones. Storeroom lines stay blue.
- Held tickets must be discoverable from the counter and resumable directly, showing the medicines and total. They remain bound to their original shop and seller.
- Count by number of GHS 10, 20, 50, 100 and 200 notes, with a live total. Counting drafts can begin before the sales cutoff and survive navigation/reload on the same browser.
- The Finish today's sales button closes the current sales-report bucket, not the ability to serve customers. Sales confirmed after it belong to the next day's report. A ticket opened earlier but confirmed after cutoff is a later sale.
- Counting cannot be submitted before that button is pressed. There is no advance amount to set aside and no drawer-switching prompt.
- Maintain separate reporting and physical-cash dates. Tonight's expected cash includes all cash actually received tonight, even for sales assigned to tomorrow's report. Tomorrow's opening cash already includes whatever was physically left; never add yesterday's later-sale cash again.
- The final cash left is still entered last, immediately before locking up, after money sent and all later sales/outflows have been recorded.

Owner permissions and reports clarification, 2026-10-21 (latest):
- Shared price changes require no reason, whether by an administrator or an employee with price permission. Record the person, old/new amounts and time. Only admins may view that history.
- Administrators do not have to explain their actions. Record their identities independently even when there are multiple admins, including account creation and permission changes.
- Keep activity and price-change reports inside Account > Activity reports, visible only to administrators. Do not scatter report feeds throughout selling and editing screens.
- May count daily cash is a per-shop employee permission. An assigned employee without it may explicitly tick Count without permission. Record this override, the employee, shop and time; no reason is requested. This never grants access to another shop or grants price/admin permissions.
- Every medicine in the company catalogue must be searchable at either shop, regardless of whether stock is held in a main storeroom or pharmacy storeroom. Add as shelf by default. The shelf-unavailable mark is manual and shop-specific; medicines remain searchable when marked unavailable, with storeroom hints. Storeroom stock never removes that mark.

Sales reports, expected-cash reconciliation, late-sale totals and sales history are admin-only. Employees can sell and submit physical counts (with permission or the recorded override), but this never grants report access. Enforce this on API responses as well as screens.

Owner simplification, 2026-10-22 (latest):
- Remove Money sent to. Do not replace it with a vault name, recipient or destination field.
- The counter chooses the sales date on the count, defaulting to today's GMT date when sending. Save the actual submission timestamp automatically and independently. The selected date describes the count; it does not overwrite sale timestamps, cutoff assignments or physical cash history.
- Money out requires only amount and reason. Any assigned employee or admin can record it immediately; there are no requests, approvals or payee/type fields. Record the actor and time and subtract it once from that physical day's expected shop cash. Keep gross sales intact so the owner can distinguish sales, recorded outflows and unexplained differences.
- A reason IS required for Money out, including admins, as explicitly requested here. Other administrative actions retain the no-explanation rule.
- Account opens on full name, username, role/status and permissions. Show the password form only after Change password is pressed. Save password changes through the existing secure password-change flow.

Category controls restored, 2026-10-22: Account > Medicine categories is admin-only, with category creation and checkbox medicine assignment. Daily cash shows separate category totals by default, excluding those medicines from the ordinary-medicine subtotal. Show medicines expands sold items, quantities and prices. The combined cash reconciliation still includes all categories once. Reports use the sales reporting date, including carried late sales; completed sales retain their original category even when assignments change.

Owner exception dates and extra change clarification, 2026-10-22:
- Admins can set a shop's exception date before sales begin (today or a future date). Individual medicine tickets are disabled on that date; price lookup remains available.
- An admin records one total sales amount for the exception day, including zero when appropriate. No individual medicine quantities, category breakdown or stock deductions are invented from that total.
- Record the sales total before finishing the day's sales/count. The normal denomination count, money sent and final cash left are still required. Actual final cash carries into the next day.
- Admins can record extra change brought in from outside sales under Daily cash. Record amount, actor and time without asking for a reason. Add it once to expected shop cash, separately from sales income, including when brought in after cutoff but before lock-up.
- Setting exception dates, submitting their sales total and recording extra change are admin-only. Existing counting permissions/explicit counting overrides still apply to physical cash counts; they do not grant sales-report access.

Medicine entry simplification, 2026-10-22: Keep name, optional other names, base unit, price per base unit and optional barcode. Type dosage/form directly into the name and brand in brackets when needed. Do not ask for separate strength, dosage form or brand fields. Preserve optional box/strip/pack registration with conversion quantities and separate prices. Existing medicine details remain intact.

Latest owner correction: Counting happens while multiple staff continue selling. Use one cutoff before final submission. After-cutoff sales remain on that same day's sales record and add to the cash available as change. The counter can include some of that cash in money sent by editing the denomination counts. Submit money sent and final cash left together; no separate change-at-cutoff amount or second lock-up checkpoint. Final actual cash alone carries into tomorrow. This supersedes all earlier next-day sales allocation instructions.

Owner ticket, account and offline clarification (2026-10-23): Only pressing Hold ticket holds a ticket. Closing/cancelling an empty ticket closes it; closing one with medicines requires confirm/reject and retains actor, medicines, shop and time behind the scenes for admins. Replace the duplicate account-profile card with Settings. Activity reports request one GMT date and paginate on the server. Sales must work with cached medicine data and durable device queues without internet, with automatic retry on reconnect while the app runs. Preserve original sale date and flag reconciliation conflicts rather than silently changing them. Refunds are available to admins under Account and use original paid amounts. See OFFLINE_SALES.md for implemented behaviour and current limitations.

Owner unavailable-list and notification clarification (2026-10-23):
- The counter has an Unavailable medicines filter for the selected shop. It lists manually marked shelf selling units and retains storeroom hints without clearing the mark. Normal search remains empty until typing.
- Download list creates a CSV of the full unavailable list for that shop, including names, units and GHS prices. Offline exports use saved device data and identify that source; reconnect to obtain current availability.
- Employees receive in-app medicine updates with prices when medicines or selling units are added or shared prices change. Shelf-availability updates are limited to assigned shops. Each user has an independent unread status. Updates load in pages and refresh while connected or on reconnect; these are not closed-app phone push notifications.
- Notifications do not expose the administrator-only audit history or who changed a price. Admins still have access to those details under Activity reports.
- Hide the permissions section for administrators; retain it for employees.

Owner storeroom clarification, 2026-10-23 (supersedes older shelf-stock assumptions):
- All storeroom work belongs under one Storerooms navigation entry, separate from selling. Keep room stock, supplier deliveries, transfers, receipts and history in their own expandable sections.
- Storerooms remain permission-bound: employees can access their assigned shops' storerooms; main rooms require the separate main-storage grant. All administrators have access. Enforce permissions in the backend for reads, additions, allocations and transfer receipts.
- Shelf quantities never represent a remaining stock count. Record goods moving onto/off shelves for accountability, but do not add or deduct a shelf balance or require a shelf balance before transfer. Only storeroom balances are counted.
- Unavailable medicines remain in normal search with an Unavailable label and in the dedicated unavailable list. Availability changes only by an explicit staff mark/removal; receiving stock must not clear it automatically.
- Manual additions into authorised storerooms are required, without inventing a supplier receipt. Preserve medicine, batch/expiry, pack conversion, quantity, actor and time. Main-room duplication still requires explicit confirmation.
- Supplier prices are not needed. Suppliers need a separate page for entering medicines they intend to deliver, including pack sizes and quantities. Staff check actual arrivals and choose allocations before any stock is posted.
- Initial supplier-page implementation uses private, revocable, single-delivery links created by admins for an authorised receiving room. Links expire after 30 days. Suppliers cannot see stock, prices, sales, staff or other suppliers' deliveries. Submitted quantities are immutable; discrepancies are recorded on arrival.
