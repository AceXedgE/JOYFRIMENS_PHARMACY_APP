# Offline sales

Open the app and sign in online first on each selling device. Opening the counter saves that user's accessible shop data and a complete medicine catalogue on that device. The app shell is cached by a service worker; deployment requires HTTPS (localhost works for development).

After preparation, the counter can reload without internet, search cached medicines with the same spelling ranking, open tickets, hold or close tickets, and confirm multiple sales. Tickets retain their original shop and seller. IndexedDB stores queued requests before acknowledging them; request keys prevent duplicate sales when a response is lost. Never clear browser/site data while unsynced tickets remain. Browser storage is device-local and cannot survive a lost or reset device.

While the app is open, it retries at reconnect, on returning to the app, and every 15 seconds. Sync now is also available. An expired session requires the original employee to sign in again. Signing in as someone else never sends another employee's queue. Do not rely on the browser running background work while closed, particularly on iOS. The 8:30pm GMT warning is displayed while the app is running, not as a guaranteed closed-app notification.

Each queued operation is uploaded as an immutable device record before being applied. The device-recorded time and server receipt time are distinct. Confirmed sales still pass server authorization, price, stock and day checks. Invalid or conflicting operations stay queued with a visible error; one blocked ticket does not prevent other tickets from syncing. Stale prices, insufficient storeroom stock, and a day already closed require reconciliation; they are never silently discarded, duplicated, or moved into today's cash. Archived details are in the admin activity report. A complete administrator correction workflow for closed-day conflicts is not yet implemented.

Before final cash submission, reconnect all selling devices and check they have synced. The app blocks final submission when this user's current-device queue or a known uploaded unapplied sale remains. The server cannot know about records on another device that has never reconnected. Refunds, account changes, stock receiving and final cash submission remain online operations.

Ticket closing is distinct from holding. Only Hold ticket creates a held ticket. Closing an empty ticket closes it immediately; closing a ticket containing medicines asks for confirmation and retains the saved medicines, actor, shop and timestamps in admin audit records. No cash or stock is posted for a closed ticket. Abruptly closing the browser preserves the device's current draft for recovery; it does not silently hold it.

Account > Refunds is admin-only. Select the sale date and original sale, then enter returned quantities. The refund uses the amount actually paid, cannot exceed the remaining quantity, and deducts today's cash once. Returned tracked stock is kept out of sellable stock unless the admin explicitly selects restocking. No printed receipt or drawer selector is shown.

Account > Activity reports loads the selected GMT date, at most 100 activities or 30 price changes per page. Date indexes support filtering on the server; the browser never fetches the complete history on opening.
