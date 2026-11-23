# KODEMS — Essential architecture reference

**Decisions:** modular-monolith NestJS REST API (`/api/v1`) shared by all clients; Next.js (App Router) web client; PostgreSQL + PostGIS; Prisma 7 (driver adapter, no Rust engine); Socket.IO fed by a transactional outbox; BullMQ on Redis for background jobs; S3-compatible storage boundary; Docker + Nginx.

**Stack:** Web — Next.js 15, React 19, TypeScript strict, Tailwind 3, TanStack Query, React Hook Form + Zod, Recharts, MapLibre GL, Socket.IO client, Vitest, Playwright. API — NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod validation, Argon2id, JWT, otplib (TOTP), BullMQ, ExcelJS, PDFKit, Jest + Supertest.

**Folders:** `apps/api/src/{common,auth,users,geography,reports,incidents,teams,deployments,population,relief,shelters,notifications,analytics,dashboard,admin,realtime}`, `apps/api/prisma/{schema.prisma,migrations,seed.ts,demo.ts}`, `apps/web/src/{app,components,lib}`, `docs/`, `deploy/`.

**Conventions:** controllers thin → services own business rules → `common/state.ts` holds pure state machines; every mutation = one DB transaction that also writes audit + outbox; list endpoints are server-paginated `{data, meta}`; errors `{error:{code,message,details,requestId}}`; Zod at every boundary; no raw `fetch` in components (`lib/api.ts`).

**Database principles:** UUID PKs; FKs `ON DELETE RESTRICT`; UTC timestamps; enums for statuses; `version` column + optimistic concurrency on mutable records; append-only tables (audit, inventory ledger, status histories, incident updates) enforced by triggers; PostGIS generated `geom` columns + GiST indexes; migrations are versioned SQL, applied once, checksummed, never destructive.

**API principles:** `@Perm()` on every route (global `AuthGuard` denies by default); scope applied in queries (`scopeWhere`) and single-record checks (`assertInScope`); `Idempotency-Key` on retry-prone submissions; unsafe transitions return 422 with a stable `code`.

**Security requirements:** Argon2id; access JWT 15 min in memory only; rotating refresh in httpOnly SameSite=Strict cookie + `X-Requested-With` CSRF header; reuse detection revokes all sessions; lockout after 5 failures; per-route throttling; Helmet; magic-byte upload validation; CSV-injection escaping; PII masked unless `population.pii`, PII views audited; production refuses dev secrets.

**Critical business rules:** see PRD §7.
