# Drug catalogue and shared prices

## Confirmed policy

The owner confirmed on 2026-10-16 that both pharmacies always use the same price for the same drug and selling unit. There is one authoritative price row per unit, not two shop prices kept in sync. The catalogue is designed primarily for phones, with desktop support.

Shop access still controls which catalogue listings employees may view. An employee granted price permission in an assigned shop may edit a unit listed in that shop; this deliberately changes the shared price at both pharmacies. Both the staff-permission form and price-edit form explain that scope. It does not grant access to the other shop's inventory, availability controls, or sales.

## Product identity and selling units

Admins define the drug/brand name, generic name, strength, dosage form, and a consistent base stock unit. Each selling unit has a label, integer base-unit quantity, optional unique barcode, and an approved GHS price. At least one unit must match the base unit with quantity one. Up to ten units can be defined on a product.

For example, a box may contain 14 tablets. The box price is entered explicitly; the system does not assume it equals 14 times the tablet price. A bottle or single container may itself be the base unit. Pack conversions cannot be fractional and must be between 1 and 100,000 base units.

Product identity and conversions are immutable in this sprint, including at the database level. To correct a mistaken strength, form, or pack definition, mark the old listings unavailable and create a corrected product. This avoids rewriting future stock/receipt references. Editing identity or adding units to an existing product is not implemented yet; define the intended units when creating the product. Later receipt/stock logic must retain the original unit and price version.

Product definitions are shared so transfers and pricing can refer to the same identity. Creating a drug lists all its defined units at the currently selected shop. An admin can list those existing units in the other shop with **Include drugs not listed here**. Ordinary employees cannot enumerate unlisted products. Duplicate normalized-case identities, unit labels, and barcodes are rejected; a failed creation rolls back all product, unit, price, listing, and audit writes.

## Money and history

Prices are positive integer pesewas, from 1 to 100,000,000 (GHS 0.01 to GHS 1,000,000.00). The frontend converts decimal strings by splitting whole/fractional digits, without binary multiplication/rounding. More than two decimal places, scientific notation, negatives, and zero are rejected. The API accepts integer `priceMinor` values only. No tax, discount, tender, or line-total calculation is part of this sprint.

Every price edit requires the currently displayed price version and a reason. In one database transaction, the API rechecks the current session and permission, locks the shared price row, compares its version, updates it, appends immutable price history, and records an audit event. History stores old/new prices, version, actor, initiating shop, server time, and reason; employee history responses do not disclose the initiating shop's identity. It shows all shared price versions because the price belongs to both shops.

Two requests using the same version cannot both succeed. The loser receives 409 and must reload. Retrying an already committed edit with the old version also receives 409 rather than producing a duplicate history entry. A user must check current history after an ambiguous network response before submitting another edit. A price edit never changes availability.

Availability belongs to a shop and selling unit. It has its own version and audited before/after changes. Only admins may list units or change availability. This flag means the shop offers the unit; it is not a physical stock quantity, batch status, or expiry guarantee. Stock tracking is Sprint 4. Neither history nor current prices can be deleted through this API.

## Search and mobile behavior

Search supports full queries up to 120 characters, beyond the original six-letter proposal. Exact names/generic names/full identities/barcodes rank first, then prefixes, contained text/token matches, then bounded spelling suggestions. Suggestions need a sufficiently long word and never fuzzy-match numeric strengths. Confirm the displayed strength/form before using a result; search never selects or substitutes a drug automatically.

Literal matched fragments are highlighted using React text nodes, not injected HTML. Results include unavailable units with a visible label. Pagination returns 20 drugs per page. Queries are debounced, pending reads are aborted on changes, and switching shops remounts the catalogue so an old shop's editor/results cannot become the new shop's form. Mutations retain the shop captured when submitted. A pending completed request may still finish for its original shop.

The initial server ranks the authorized catalogue in memory before pagination. This keeps identical behavior on PGlite and PostgreSQL without optional search extensions. Large catalogues will need profiling and indexed database search; pagination currently limits response size, not the server's initial scan. No search or price writes work offline yet.

## API

All endpoints inherit session, CSRF, origin, and body-validation controls from Sprint 2. Invalid types and unexpected fields are rejected. Currency is GHS.

`GET /api/shops/:shopId/catalogue?q=...&page=1&includeUnlisted=false`

Returns products, their units, total/page/pageSize, `priceScope: "both_shops"`, and current `canChangePrices`/`canManageCatalogue` flags. Only admins may request unlisted drugs. Unlisted units have `available: null` and `listingVersion: 0`; their shared price already exists.

`POST /api/shops/:shopId/catalogue` (admin only):

```json
{
  "name": "Example medicine",
  "genericName": "Example generic",
  "strength": "Example strength",
  "dosageForm": "Tablet",
  "baseUnit": "tablet",
  "reason": "Initial approved catalogue entry",
  "units": [
    { "label": "tablet", "baseQuantity": 1, "barcode": "", "priceMinor": 125 },
    { "label": "box", "baseQuantity": 14, "barcode": "EXAMPLE-BOX", "priceMinor": 1500 }
  ]
}
```

These example prices are synthetic, not a real pharmacy price list. No medicines or prices are seeded into your development database automatically.

`PUT /api/shops/:shopId/catalogue/units/:unitId/price`

Body: `{ "priceMinor": 150, "expectedVersion": 1, "reason": "Approved price review" }`. Requires admin or current price permission in that shop, plus a listing for the unit. Updates the shared price for both pharmacies. Includes unavailable listings; changing price does not reactivate them.

`PUT /api/shops/:shopId/catalogue/units/:unitId/availability`

Body: `{ "available": true, "expectedVersion": 0, "reason": "Introduce at this shop" }`. Admin only. Version zero creates the first shop listing. Later changes must use its current `listingVersion`, which is independent of `priceVersion`.

`GET /api/shops/:shopId/catalogue/units/:unitId/history?page=1`

Returns up to 20 shared-price versions, newest first, with total/page/pageSize. Employees must have access to that shop and a listing for the unit. Admins may inspect unlisted units. Old prices remain unchanged after edits.

## Migration and verification

With the API stopped, run `npm run db:migrate -w backend` to add migration 002. The ordered migration runner verifies old checksums and applies pending migrations transactionally. Existing accounts and storage locations are preserved. The original migration is unchanged.

Backend tests cover upgrades from migration 001, permissions, revocation, cross-shop isolation, shared prices, unit validation, rollback, immutable history/conversions, exact money parsing, search ranking, and concurrent/stale edits. The mobile browser workflow adds a product and box, changes a price, lists it at the second shop, changes availability independently, exercises a stale edit and history, and verifies read-only search at 390px/320px. Deployment PostgreSQL and physical-phone validation remain environment-specific release checks.
