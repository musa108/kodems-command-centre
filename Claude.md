# Claude.md — persistent instructions for KODEMS sessions

## Product context
KODEMS is the **web Command Centre** of the Kogi State Emergency Management Agency's platform. One shared NestJS backend serves this web app and a future unified mobile app. Government-grade, security- and audit-first.

## Architectural rules
1. Business rules live **only** in the API (`apps/api`). The web app never re-implements them; it may only gate UI.
2. Every mutating endpoint: `@Perm(...)`, Zod body validation, scope check, one DB transaction containing the change + audit row + outbox event, optimistic `version` where records are shared.
3. Pure state machines in `apps/api/src/common/state.ts`; services call them before writing.
4. Inventory is append-only ledger writes under an advisory lock. Never `UPDATE` a balance.
5. A report becomes an incident only via explicit verification.
6. Schema changes = new numbered folder in `apps/api/prisma/migrations`; regenerate `docs/ERD.md`.
7. Modular monolith. No new services/dependencies without a documented reason.

## Naming
Files `kebab-case`; classes `PascalCase`; DB tables snake_case plural (`@@map`), columns camelCase; permission keys `module.action`; API routes plural nouns, verbs only for transitions (`/verify`, `/resolve`); human refs `KOS-<PREFIX>-<year>-<seq>`.

## Coding standards
TypeScript `strict`; no `any` without cause; no `@ts-ignore`; small components; server state via TanStack Query; forms via RHF + Zod; all network via `apps/web/src/lib/api.ts`; errors use the `{error:{code,message,details,requestId}}` envelope.

## Design rules
Navy primary, gold accent, off-white/white/pale-blue surfaces. **No dark or grey page backgrounds.** Severity/status always icon + text, never colour alone. Landing page lives at `/`.

## Security rules
Never log passwords/tokens; never put access tokens in storage; never expose reporter PII on maps or lists without `incidents.verify`; mask affected-person names unless `population.pii` and audit the view; never seed demo data in production; production refuses dev secrets; don't claim an integration (SMS, email, push, S3, backups) works until configured and tested.

## Testing requirements
`npm test` (API Jest on a **real Postgres+PostGIS `_test` database**, web Vitest) must pass; add a test for every business rule; run `npm run typecheck && npm run lint && npm run build` before declaring done.

## Documentation requirements
Update `PRD.md`, `Architecture*.md`, `docs/` when behaviour changes. Keep `EMPTY` zero bytes.

## Prohibited shortcuts
Fake map boundaries; fabricated statistics, contacts, shelters or integrations; hiding buttons instead of enforcing permissions; deleting operational history; silent overwrites of newer data; resetting a production DB; disabling TypeScript/ESLint to pass builds; claiming features work without tests.

## Sandbox notes for future sessions
`prisma generate` cannot download engines offline; Prisma 7 needs none for the client — set `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` (scripts do). Migrations run through `apps/api/scripts/migrate.ts`. Start local services with `./scripts-start-services.sh`.
