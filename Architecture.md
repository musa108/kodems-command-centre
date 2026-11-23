# KODEMS — Architecture

## 1. System overview
```
 Web Command Centre (Next.js)  ─┐
 Mobile app (future: Community, ├─ HTTPS/REST + Socket.IO ─▶ NestJS modular monolith ─▶ PostgreSQL+PostGIS
   Responder, Operations)      ─┘                              │  ├─ Redis (BullMQ queues)
                                                               │  ├─ S3-compatible object storage (boundary)
                                                               │  └─ SMS / Email / Push providers (boundaries, NOT configured)
```
**Boundaries.** The web app is a pure client: no business rules beyond input hints and UI gating. All rules live in the API so the mobile app inherits identical behaviour. Contracts: REST under `/api/v1` (listed in `docs/API.md`), Zod-validated DTOs, uniform error envelope, cursor-free paged lists.

## 2. Components
- **Web:** App Router pages per module; `components/ui` design system; `lib/api.ts` typed client (single-flight refresh, error mapping); `lib/socket.ts` authenticated socket with de-duplication and coalesced refetch; `lib/permissions.ts` UI hints; `components/maps` MapLibre.
- **API modules:** `auth`, `users` (users/roles/permissions), `geography` (+ map layers), `reports`, `incidents`, `teams`, `deployments`, `population`, `relief`, `shelters`, `notifications` (+alerts), `analytics`, `dashboard`, `admin` (config, audit, health, search, media), `realtime`, `common` (Prisma, audit, outbox, notify, jobs, storage, state machines).
- **Why a modular monolith:** one deployable, transactional consistency across report→incident→deployment→relief flows, simpler operations for an agency; module boundaries allow later extraction if ever justified.

## 3. Data model
56 tables; diagrams in `docs/ERD.md` (generated from `schema.prisma`). Key relationships: report ⟷ incident via `incident_report_links` (many reports per incident, a report links to one); incident → deployments → team; incident → allocations → distributions → beneficiaries; `inventory_transactions` ledger keyed by warehouse+item; households → persons; beneficiary optionally linked to a household (a beneficiary is **not** automatically an affected person). Geometry: `geom geography(Point,4326)` generated from lat/lng on incidents, reports, shelters, warehouses, teams; `geographic_boundaries.geom geometry(MultiPolygon,4326)`; GiST indexes. `background_job_records` was intentionally not created: job state lives in BullMQ/Redis.

## 4. Authentication & authorisation
Login → Argon2id verify → access JWT (HS256, 15 min, returned in body, held in browser memory) + opaque refresh token (SHA-256 stored, httpOnly SameSite=Strict cookie scoped to `/api/v1/auth`). Refresh rotates; replay of a used token revokes the whole family. TOTP MFA (setup/enable endpoints, login challenge); MFA is *required* for roles flagged `mfaRequired` when `APP_ENV=production` (user may log in only to enrol). `AuthGuard` reloads roles/permissions/scope per request (deactivation is immediate) and enforces `@Perm`. Scope: users with `user_scopes` (or a `scopeRequired` role) are restricted; list queries add `lgaId IN scope`; record access calls `assertInScope`. Analytics/exports use the same scoped queries.

## 5. Event-driven & real-time
Mutations write an `outbox_events` row in the same transaction. A relay (`FOR UPDATE SKIP LOCKED`, 1 s) marks events published and emits to the Socket.IO gateway. Sockets authenticate with the access token; each socket receives only events whose permission **and** LGA scope it holds. Payloads carry ids/refs; clients de-duplicate by `eventId`, coalesce bursts, and refetch via the API. On reconnect all queries are invalidated. If sockets fail the UI shows *Offline* and continues via polling/focus refetch.

## 6. Background jobs
BullMQ queue `alert-delivery` (5 attempts, exponential backoff). Without provider credentials the worker records `NOT_CONFIGURED` per channel — nothing is claimed sent. Bulk export currently runs in-request (bounded to 20 000 rows).

## 7. Offline considerations for the mobile app
Stable UUIDs, server timestamps, `version` for optimistic concurrency (stale writes → 409), `Idempotency-Key` on report, deployment-update, stock and distribution submissions, append-only histories that mobile can sync from. Conflict policy: server wins on stale `version`; client must refetch and re-apply.

## 8. Security architecture
See `Architecture_essential.md` and `docs/DATA_PROTECTION.md`. Additional: DB-level immutability for audit/ledger/history; row/advisory locks for inventory, shelter capacity and team assignment; no secrets in repo; production start refuses dev secrets.

## 9. Deployment architecture
`deploy/nginx.conf` terminates TLS and routes `/api` + `/socket.io` to the API and everything else to the web container (same origin, so cookies and CORS are simple). `docker-compose.yml` runs `postgis/postgis`, `redis`, `api`, `web`, `nginx`. Separate dev/staging/prod via env files. See `docs/DEPLOYMENT.md`.

## 10. Scalability & reliability
Stateless API (scale horizontally; sessions are DB-backed; Socket.IO needs the Redis adapter or sticky sessions beyond one instance — **not yet configured**); server-side pagination; indexed filters; spatial indexes. Backups: `pg_dump`/WAL archiving procedures in the deployment guide; **no backup job is integrated and health reports "UNKNOWN"** until one is.

## 11. Disaster recovery
RPO/RTO targets must be agreed with KOSEMA. Procedure: restore latest base backup + WAL to a new Postgres, run `npm run db:migrate` (idempotent), point the API at it, verify `/system/health`, then reopen traffic. Object storage should be versioned/replicated.
