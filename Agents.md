# KODEMS — Development agents and responsibilities

| Agent | Owns | Works independently on | Must coordinate with |
|---|---|---|---|
| **Architecture** | Module boundaries, ADRs, `Architecture*.md`, state machines, API versioning | Documentation, ADRs | Everyone before changing a boundary or contract |
| **Frontend** | `apps/web` pages/components, accessibility, responsive behaviour | Presentational components, styling, client-only utilities, Vitest | API/DB agents when a contract changes; UI/UX for tokens |
| **Backend / API integration** | `apps/api` modules, DTO/Zod schemas, permissions catalogue, `lib/api.ts` contracts | Service logic behind stable DTOs | Frontend (contract changes), DB (schema), Security (authz) |
| **Database** | `schema.prisma`, migrations, indexes, PostGIS, triggers, seed | New indexes/queries that don't change shape | Backend (model changes), DevOps (migration rollout) |
| **UI/UX** | Design system (navy/gold/light; no dark or grey page backgrounds), content, landing page, empty/error states | Visual polish, copy | Frontend for implementation; Security for sensitive-data display |
| **Security** | Threat model, authz review, PII handling, DPIA inputs, dependency review | Reviews, test cases | Backend/DB for fixes; DevOps for secrets/headers |
| **Testing / QA** | Jest integration suite, Vitest, Playwright, accessibility checks | New tests | All agents: tests are required with every business-rule change |
| **DevOps** | Docker, Nginx, CI, environments, backups, monitoring | Pipeline, compose, runbooks | DB (migrations), Security (secrets/TLS) |

**Coordination rules.** (1) Any change to a DTO, permission key, status enum or migration needs Architecture + Backend + Database + Frontend sign-off in the same PR. (2) A business-rule change must ship with a test. (3) Docs change in the same PR as the behaviour. (4) Never edit an applied migration; add a new one. (5) Mobile-impacting contract changes are versioned (`/api/v2`) rather than broken.
