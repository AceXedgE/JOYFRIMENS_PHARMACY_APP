# Hosting on Render

The app is prepared to serve its React frontend and API from **one Render web service**, backed by **Render PostgreSQL**. The frontend and backend remain separate directories. Nothing has been published or purchased.

## Settings

| Setting | Value |
|---|---|
| Runtime | Node.js 24 |
| Repository root | Project root; leave Root Directory blank |
| Build | `npm ci --include=dev && npm run build` |
| Pre-deploy | Leave blank on the free plan |
| Start | `node backend/dist/cli.js migrate && node backend/dist/server.js` |
| Health check | `/api/ready` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `SERVE_FRONTEND` | `true` |
| `DATABASE_URL` | Render database **internal** connection URL, stored as a secret |
| `APP_ORIGINS` | Optional for the generated Render address; required when adding a custom domain |

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. The generated HTTPS URL becomes the allowed app origin when `APP_ORIGINS` is absent. For a custom domain, set exact comma-separated HTTPS origins, without trailing slashes. Cookies remain Secure and HttpOnly. The database and service must be in the same region.

The checked-in `render.yaml` uses **free trial plans**, as requested, with automatic deploys disabled. Migrations run at startup and the server starts only if they succeed. Free services do not support pre-deploy commands. Upgrade both resources before live trading; review the displayed prices then. Free web services sleep; free databases expire after 30 days and are unsuitable for the live pharmacy. See [Render's free-plan limits](https://render.com/docs/free), [database setup](https://render.com/docs/postgresql-creating-connecting), and [Blueprint configuration](https://render.com/docs/blueprint-spec).

## Carry over this database and existing accounts

For the existing installation, use these manual steps so the data is restored **before the first app deployment**. A fresh Blueprint deployment creates an empty schema; do not restore a full SQL dump over that schema.

1. Finish syncing every device's pending tickets. Stop staff using the local installation during the final export and cutover.
2. Stop the local API, back up `backend/.data`, then export to a private location:

   ```powershell
   node scripts/export-for-render.mjs --server-stopped --output "$env:TEMP\joyfrimens-render.private.sql"
   ```

   The exporter includes accounts/password hashes, permissions, medicines, stock, cash, audit history and schema migrations. It excludes active sessions and login-throttle data, so everyone signs in again. It creates a JSON sidecar with table counts and a checksum. The SQL file is sensitive: do not commit it or put it in a public download location. An export created during development must be refreshed at final cutover if data has changed.

3. Create a new, empty Render PostgreSQL 18 database on the Free plan, named `joyfrimens-db`, with database/user `joyfrimens` and region Frankfurt. Temporarily allow only the operator's public IP for external access. Obtain its **external** connection URL privately through Render. On a machine with PostgreSQL 18 client tools, restore the dump with:

   ```sh
   psql "$RENDER_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 --file joyfrimens-render.private.sql
   ```

   The destination must be empty. Do not run bootstrap or migrations before this full-schema restore. Stop on any error; do not use `--clean` against a populated destination. Compare table counts with the export's JSON sidecar, particularly users, products, sales and stock balances. Then close external access again. No database credentials need to be shared in chat.

4. Create the Render web service from the repository, with the settings above and the database's internal URL. Select the Free plan, Frankfurt region, and `main` branch. Leave Root Directory and Pre-deploy Command blank. Disable automatic deploys until the trial is verified. Do **not** run `setup:dev`, `seed:dev` or a catalogue-reset import on Render. Existing accounts already came across in the dump.
5. Open `/api/ready` and verify it reports ready, then sign in with an existing account. Check both shops, shared prices, permissions, daily cash and the supplier portal.
6. Open the HTTPS app on each selling device while online, sign in and allow its catalogue to cache. Test an offline ticket, reconnect and verify it posts once. Offline browser data belongs to the old origin and does not automatically move to the new Render address; pending local tickets must be synced before cutover.
7. Enable and verify database backups, test restoring a backup, and complete the real-device cash-close pilot before relying on it for live trading. Keep the old local backup private; do not continue selling on both independent databases.

## New installation instead

If no existing data is to be carried over, the `render.yaml` Blueprint provisions the service/database and runs migrations. On a paid service, bootstrap the first admin once through Render's private shell with `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` and `BOOTSTRAP_NAME` supplied as temporary secrets, then run `node backend/dist/cli.js bootstrap`. Remove bootstrap secrets afterwards. Free services have no private shell; a fresh installation needs a separate private bootstrap step. This is **not** the route for preserving the current accounts and catalogue.

## Verification status

The deployment still needs an actual Render account/repository connection, selected plans, a restore into Render PostgreSQL and HTTPS/device smoke tests. Local builds and embedded-database tests do not replace a real Render/PostgreSQL deployment test. No hosting credentials or purchases are included in this preparation.
