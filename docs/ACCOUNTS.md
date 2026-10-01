# Accounts, database setup, and access

## Confirmed business configuration

Tomjoy Pharmacy and Joyfrimens Pharmacy both use GHS and GMT (`Etc/GMT`). Dates in the account audit screen include weekday, day, month, year, and time. Each shop owns a shelf location and a storeroom location. Main-storage rooms 1 and 2 have no owning shop and serve both.

## Local development

Run `npm run setup:dev` from the root once, then `npm run dev`. Development setup generates a unique random password for `demo.admin` and prints it once; it never installs a shared/default password. This command only works with the local embedded database, and refuses to replace existing accounts. Record the password before closing the terminal.

The default database is `backend/.data/`. Do not run multiple API or setup processes against the same embedded database simultaneously. Do not delete it to reset an account: it contains persisted staff and audit records. Development credentials and data must not be used for a live deployment.

## PostgreSQL deployment and first admin

Use a dedicated PostgreSQL database and a migration connection with the necessary DDL privileges. Use a separate least-privilege runtime database role in production: grant SELECT/INSERT/UPDATE/DELETE only on application tables needed by the API, SELECT/INSERT on audit events and its identity sequence, and read-only access to schema migrations. The runtime role must not own schema objects or be able to disable triggers. Provisioning these database roles is a deployment step, not something the app performs with superuser credentials.

Set configuration through deployment secrets or a protected process environment:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Requires external PostgreSQL and HTTPS origins; enables Secure host-only cookies. |
| `DATABASE_URL` | PostgreSQL connection string; use verified TLS for a remote database. |
| `APP_ORIGINS` | Comma-separated exact frontend origins, such as `https://pharmacy.example`. No paths or trailing slashes. |
| `HOST`, `PORT` | Bind address and port; defaults are `127.0.0.1:3001`. |
| `BOOTSTRAP_USERNAME` | Initial admin username, 3–64 lowercase letters/digits/dot/underscore/hyphen. |
| `BOOTSTRAP_PASSWORD` | Unique initial admin password, 12–128 characters. |
| `BOOTSTRAP_NAME` | Initial admin display name. |
| `SHOP_1_NAME`, `SHOP_2_NAME` | Optional overrides of the confirmed pharmacy names. |
| `SHOP_CURRENCY`, `SHOP_TIMEZONE` | Defaults: GHS and Etc/GMT. |

Do not put real credentials into shell history, Git, or command-line arguments. Supply secrets through your deployment environment. `.env.example` is documentation; files are not automatically loaded.

With the API stopped, run:

```sh
npm run db:migrate -w backend
npm run db:bootstrap -w backend
npm run build
npm start -w backend
```

Bootstrap locks a singleton setup row and creates the administrator, shops, locations, and audit event in one transaction. A second run refuses to alter existing accounts. Remove bootstrap secrets from the environment after provisioning. Migration checksums prevent rewriting an applied migration; future schema changes must be new migrations.

Serve `frontend/dist/` over HTTPS and reverse-proxy `/api` on the same origin. The public health endpoint is liveness, not proof of synchronization or ongoing database readiness. Server startup refuses a missing schema. The backend deliberately does not trust client-supplied forwarded IP headers; configure a trusted proxy policy before using forwarded addresses for production login throttling.

## Staff workflow

Admins create accounts from **Staff & permissions**, selecting employee or administrator. Admin accounts have all-shop, price, and shared-storage access. Employee access is explicit: each shop assignment separately includes price-changing permission, and shared main storage has its own grant. Price permission prepares the catalogue workflow in Sprint 3; there is no drug-price editing endpoint yet.

Account roles are fixed at creation in this sprint. Employees cannot create users, change permissions, disable accounts, or inspect admin audit records. Only admins see those controls, and the backend independently rejects direct unauthorized API calls. No refund, withdrawal, or stock-adjustment authority is implied by price permission; those actions and their permissions arrive in later sprints.

Changing access takes effect on the next server request, including existing sessions. Disabling an account revokes its sessions; reenabling it does not revive old sessions. Admins cannot disable themselves. Staff can change their own password with their current password; this signs them out everywhere. Forgotten-password recovery and MFA are not implemented yet; do not delete account or audit records as a recovery shortcut.

## Session and security controls

- Passwords use Node's scrypt with a random 16-byte salt, N=131072, r=8, p=1, and constant-time hash comparison. Password hashes are not returned by the API or recorded in audit events. See [Node crypto](https://nodejs.org/api/crypto.html).
- Sessions use random 256-bit opaque tokens. The database stores only their SHA-256 digests; the browser receives an HttpOnly, SameSite=Strict cookie. Production uses the Secure `__Host-` cookie prefix with no Domain attribute. Sessions expire after eight hours, without implicit extension.
- Writes require `X-Requested-With: joyfrimens`. If Origin is present it must match configured origins, and cross-site Fetch Metadata is rejected. Authenticated writes additionally require `X-CSRF-Token`, returned by login or `/api/auth/me`. CSRF tokens stay in frontend memory, not localStorage. Cross-origin API access is not enabled.
- Login limits persist in the database: 10 attempts per username and 50 per client IP in a 15-minute window. Password changes have a separate five-attempt limit. Unknown and disabled accounts receive the same login error as incorrect passwords.
- Request bodies are limited to 16 KiB; route schemas reject unexpected fields and invalid types. SQL uses bound parameters. Sensitive headers are redacted and request bodies are not logged.
- Account creation, access changes, activation changes, sign-in failures/successes, logout, and password changes create audit records. Mutations and their audit entries commit together. Database triggers prevent ordinary UPDATE/DELETE on audit events. A database owner can still bypass triggers: production privileges and external audit backups remain necessary.

## API examples

Login body: `{"username":"staff.name","password":"<user-supplied password>"}`.

Login and `/api/auth/me` return `{ user, csrfToken }`; the user object contains id, username, name, role, active, and sharedStorageAccess. The cookie is the authentication credential; the CSRF token alone cannot authenticate.

Create-account body:

```json
{
  "username": "staff.name",
  "name": "Staff Name",
  "password": "<unique user-supplied password>",
  "role": "employee",
  "memberships": [{ "shopId": "<shop UUID>", "canChangePrices": false }],
  "sharedStorageAccess": false
}
```

`PUT /api/admin/users/:id/access` replaces the employee's complete membership list and sharedStorageAccess flag. An empty membership list removes all shop access. Duplicate/unknown shop IDs fail and roll back. Admin access cannot be reduced through this employee endpoint. `PATCH /api/admin/users/:id/status` accepts `{ "active": false }` or true.

`POST /api/auth/password` accepts `currentPassword` and `newPassword`. Logout and password change clear the cookie after revocation. Invalid/expired sessions return 401; denied permissions/CSRF return 403; an unauthorized shop detail returns 404 to avoid disclosing it; validation returns 400; duplicate usernames return 409; throttling returns 429.

## Verification

`npm run check` checks types, applies migrations to a fresh embedded PostgreSQL database, verifies auth and access behavior, builds both applications, and checks the built HTTP proxy. The smoke test uses a temporary database and cleans up only its own generated directory.

`npm run test:e2e` uses an isolated in-memory database and random, ephemeral test passwords. It drives admin sign-in, both-shop selection, employee creation and price permission, employee-only shop access, session restoration, and password-change sign-out at a mobile viewport. It does not use your development accounts.

Set `TEST_DATABASE_URL` to a test PostgreSQL server to run the same database/API suite there. The suite creates and drops its own randomly named schema, never truncating existing application tables. The CI PostgreSQL 17 job exercises this path. Local verification used embedded PostgreSQL and headless Edge; a server-PostgreSQL deployment and actual iPhone/Android devices still need environment-specific validation.
