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
 prices of the drugs can be updated by all admins and employees explicitly given price-changing permission. Every change must keep the old price, new price, person, shop scope, reason, and time. The drugs can be made unavailable with a check box(or something)
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
- Every shop also has its own storeroom. Its storeroom stock and retail stock are tracked separately and belong to that shop.
- Switching shops displays the selected shop's drugs, sale drafts, retail stock, and storeroom stock. Existing records keep their original shop.
- Moving goods between a shop's storeroom and its retail stock, or between shops, requires a recorded stock transfer; switching the selected shop never moves stock.
- Drugs entered into a sale draft are saved strictly under that draft's shop.
- After an employee switches shops, new sale drafts are saved under the newly selected shop. Existing drafts and completed sales keep their original shop.
- When opening a new draft, check device location to help verify the selected shop. Never automatically change the selected shop based on location.
- If location is off or unavailable, show a warning naming the selected shop and ask the employee to confirm that shop or change it before continuing. Employees do not have to enable location to proceed.
- If location suggests a different shop, warn the employee to verify the selection. If location is too imprecise, report that the shop could not be verified.
- Before switching with an unfinished draft, finish, discard, or park it at its original shop. Resuming it must restore and clearly display that original shop.

Confirmed operating rules (these take precedence over earlier brainstorming):
- Customer payments are cash only. Record cash tendered and change; no credit, mobile-money, card, or bank-transfer checkout.
- The main storeroom, with rooms 1 and 2, supplies both shops. Each shop has separate shelf stock and its own storeroom stock.
- Each shop can sell from its shelves or directly from its own storeroom. Every sale line must identify where the goods were taken from; deduct that location once. A basket can include goods from both locations.
- Main-storage deliveries to a shop are recorded transfers, not sales. Track dispatch, receipt, shortages, and goods in transit.
- While one cash drawer is being counted, sales use a different drawer with its own recorded opening float. Record any transfer between drawers. Count and reconcile both separately.
- All admins may change prices. Only specifically permitted employees may do so, for their authorized shops. Changing prices does not permit changing old receipts or granting permissions.

Offline operation:
- Save completed sales durably on the device, including their shop, drawer, staff member, stock source, quantity, saved price version, and cash/change. Show success only after the local save succeeds.
- Keep an upload queue and automatically retry when the app can reach the server. Keep each record until the server acknowledges it. Repeated uploads must never create duplicate sales.
- Always show offline/sync status, pending sale count and amount, and last successful sync. Unsynced shop totals are provisional, including totals sent to the admin.
- At 8:30 p.m. in the shop's configured timezone, warn if the server cannot be reached or records remain unsynced. Show any missed warning on the next app opening. Acknowledge does not mean synced.
- Keep local data across restarts, logout, and updates. Do not offer an app reset that discards pending records. Device loss or externally cleared storage can still lose unsynced records.
- Use the last approved downloaded prices offline, clearly showing that they may be stale. Price and permission changes require an online server acknowledgment; completed offline receipts are never silently repriced.
- Before offline selling, assign each drawer session to one device and allocate exclusive stock quantities to that device. Other devices cannot sell or transfer those quantities until released safely. Never assume two offline devices share a live stock balance.
- Offline closing counts are provisional until all participating devices sync and conflicts are reviewed. Record late uploads under the original sale session/date, not the upload date.
- Detailed offline controls and verification cases are in SYSTEM_REVIEW.md. Background sync and exact closed-app warning delivery depend on the platform and cannot be assumed.
