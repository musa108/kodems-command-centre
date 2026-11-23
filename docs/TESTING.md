# Testing

| Layer | Tool | Where | What it covers |
|---|---|---|---|
| Unit | Jest | `apps/api/test/unit.spec.ts` | State machines, inventory maths, shelter rules, permission catalogue, upload validation |
| Integration | Jest + Supertest on **real Postgres+PostGIS** | `apps/api/test/api.spec.ts`, `queue.spec.ts` | Auth, sessions, scope, all 5 workflows, concurrency, immutability triggers, PostGIS, exports, alerts, BullMQ, outbox |
| Web unit/component | Vitest + Testing Library | `apps/web/test` | API client, formatting, permission helpers, schema builder, tables, forms, dialogs |
| End-to-end | Playwright | `apps/web/e2e/workflows.spec.ts` | Browser workflows 1–12 + responsive + reconnect |

Run: `npm run services:start` (sandbox helper) or `docker compose up -d db redis`; create DB `kodems_test` (owner `kodems`, `CREATE EXTENSION postgis`); `npm test`. The integration suite **drops and recreates the `public` schema of the database named in `TEST_DATABASE_URL`** and refuses any name not ending `_test`.

E2E: start API (`npm run db:seed:demo` first) and web, `npx playwright install chromium`, `npm -w apps/web run e2e`.

**Not covered by automated tests:** visual layout/contrast audits, screen-reader behaviour, load/performance targets, WebGL map rendering, real SMS/email/push, Docker images, backups.
