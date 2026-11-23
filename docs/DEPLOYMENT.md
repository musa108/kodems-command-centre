# Deployment guide

> **Verification status:** the Dockerfiles, `docker-compose.yml` and `nginx.conf` were written but **could not be built or run in the authoring sandbox (no Docker available)**. The API and web app *were* built and run natively against real PostgreSQL 16 + PostGIS 3.4 and Redis. Treat the container files as unverified until you run `docker compose build` in CI/staging.

## Environments
`development` (local, demo data allowed), `staging` (production-like, demo data allowed only if clearly isolated), `production` (`APP_ENV=production`: refuses dev secrets, refuses demo seeding, MFA enrolment enforced for privileged roles). Never share databases between environments.

## First deployment
1. Configure `APP_ENV=production`, `NODE_ENV=production`, `WEB_ORIGIN=https://<production-host>`, `PUBLIC_BASE_URL=https://<production-host>`, a strong `JWT_ACCESS_SECRET` (`openssl rand -base64 48`), a unique database password, and production licensed map tiles. Startup refuses an absent/invalid `APP_ENV`, missing `DATABASE_URL`, and production with `NODE_ENV` other than `production`. Store secrets in the host's secret manager; never commit `.env`.
2. `docker compose build && docker compose up -d db redis`
3. **Migrate:** `docker compose run --rm api node scripts/migrate.js` (applies numbered SQL migrations once, checksummed; refuses if an applied migration was edited; never drops data).
4. **Seed reference data + first admin** (idempotent; needs `ts-node`, so run it from a checkout/CI job rather than the slim runtime image): `DATABASE_URL=<prod url> APP_ENV=production SEED_ADMIN_EMAIL=you@agency.gov.ng SEED_ADMIN_PASSWORD='<strong>' npm -w apps/api run db:seed`. It loads permissions, roles, categories and the 21 LGA names, and creates the first super admin. **No default credentials exist; demo data is refused when `APP_ENV=production`.**
5. `docker compose up -d` → app at `http://localhost:8080` (put real TLS in front).
6. Sign in as the admin, **enrol MFA** (`/auth/mfa/setup`, `/auth/mfa/enable`), create users, assign roles and LGA scopes.
7. Import verified boundaries (docs/GEOGRAPHY.md).

## Schema changes
Add `apps/api/prisma/migrations/NNNN_name/migration.sql`; never edit an applied one; regenerate `docs/ERD.md`; test on a copy of production data; take a backup first; run step 3. **Never reset a production database.**

## Production configuration checklist
- TLS (443) with HSTS at nginx/LB; `WEB_ORIGIN`/`PUBLIC_BASE_URL` set to the real origin; secure cookies are automatic when `NODE_ENV=production`.
- Licensed map tiles (`MAP_TILES`/`MAP_ATTRIBUTION`); OSM public tiles are for development only.
- **Object storage:** uploads currently use local disk (`UPLOAD_DIR`, mounted volume). The S3 variables are reserved; an S3 adapter in `StorageService` is **not implemented yet** and health reports `s3-configured-adapter-pending` if S3 vars are set.
- **Providers:** SMS/email/push credentials are not integrated. Until `integration_configs` rows are set `CONFIGURED` *and* an adapter exists, delivery is logged `NOT_CONFIGURED`.
- **Socket.IO scaling:** one API instance works as-is. For >1 instance add the Redis adapter or sticky sessions (not yet configured).
- Resource limits, log shipping (stdout JSON via Nest logger → your collector), uptime monitoring on `/api/v1/health`.
- Hosting location and **data residency must be agreed with KOSEMA** before go-live.

## Backups & restore
- Daily logical backup: `pg_dump -Fc -h db -U kodems kodems > kodems-$(date +%F).dump`; production should add continuous WAL archiving (PITR). Encrypt and copy off-site; test restores quarterly.
- Restore: create an empty PostGIS database → `pg_restore -d kodems --clean --if-exists file.dump` (clean target only) → `node scripts/migrate.js` → start API → check `/system/health`.
- Uploaded evidence: back up the `uploads` volume / bucket with versioning.
- **No backup job reports into the system**; the health page shows *Last backup: UNKNOWN* until you integrate one.

## Release, rollback, and remaining launch blockers

For each release, build immutable API and web images in CI; run lint, type checks, unit tests, database-backed API tests against a disposable database ending in `_test`, dependency audit, and container scanning. Deploy to staging, apply migrations once, and smoke test login/MFA, permissions, report-to-incident workflow, uploads, alerts, maps, and socket updates. Before production migration, take and verify database and upload backups. Apply migrations as a one-off job, then roll out API and web images; do not let every replica run migrations. If behavior regresses, roll back application images. Keep migrations backward compatible and restore a backup only under the approved recovery plan.

The checked-in Nginx config only listens on port 80. Configure TLS on port 443 in the public reverse proxy/load balancer, redirect HTTP to HTTPS, set HSTS at TLS termination, and do not expose plain HTTP directly to the internet. The app has no benchmark establishing requests/second or concurrent socket capacity. Load test production-like hardware and representative data, including login, map/dashboard queries, uploads, and sustained socket fan-out. Set `DB_POOL_MAX` so replicas times pool max, migrations, and monitoring fit the database connection budget.

Nest throttling is in-process. Configure shared edge/API rate limits before running multiple replicas. This repository still lacks an S3 adapter, email/SMS/push delivery adapters, Redis Socket.IO adapter, shared distributed throttling, automated backups/PITR, and verified Kogi boundary data. Production launch also requires KOSEMA approval of hosting/data residency, privacy and retention policy, licensed map tiles, incident response contacts, and tested backup restoration.

Run `npm audit --omit=dev` in CI and resolve advisories by upgrading and validating packages. Do not use `npm audit fix --force` without reviewing breaking upgrades. Registry access was unavailable during this work, so the previously reported dependency advisories remain unverified.

Protected routes now fail closed when they lack a declared `@Perm`; add a permission and authorization regression test for each new route. Privileged MFA enrollment uses a manually entered authenticator secret; verify it in staging before enabling administrator accounts.

## Disaster recovery
Agree RPO/RTO with KOSEMA. Keep infrastructure as code, a documented rebuild order (db → redis → migrate → api → web → nginx) and run a game-day at least yearly.
