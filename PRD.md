# KODEMS — Product Requirements Document

**Product:** KOSEMA Digital Emergency Management System (KODEMS) — Web Command Centre
**Organisation:** Kogi State Emergency Management Agency (KOSEMA) · **Positioning:** *One State. One Emergency Intelligence Platform.*
**Status:** Web application implemented and tested against the shared-backend contracts. Items needing KOSEMA input are listed under *Constraints and assumptions*.

## 1. Product overview
A centralised command and coordination platform for authorised KOSEMA personnel to monitor emergencies statewide, verify community reports, coordinate response teams, manage affected people, relief stock and evacuation centres, publish approved public alerts, and analyse response performance. It is one of three clients of a single shared backend (Web Command Centre; future unified mobile app with Community, Responder and Operations experiences).

## 2. Problem statement
Emergency information typically arrives fragmented (calls, messages, field notes). Without a single system of record, verification is inconsistent, response is hard to coordinate, relief stock cannot be reconciled, and accountability is weak. KODEMS provides one auditable workflow from first report to final distribution.

## 3. Objectives
1. Verify every report explicitly before it becomes an operational incident.
2. Coordinate field response with full deployment history shared with the future Responder app.
3. Account for every relief item through an append-only ledger and approved allocations.
4. Protect sensitive humanitarian data (least privilege, scope, masking, audit).
5. Provide measurable response performance (verification, dispatch, response times).

## 4. Stakeholders and personas
| Persona (role key) | Needs |
|---|---|
| System Super Administrator (`SUPER_ADMIN`) | Configure system, users, reference data, audit, health |
| Agency Administrator (`AGENCY_ADMIN`) | Statewide operations, teams, relief, shelters, analytics, approvals |
| Emergency Operations Officer (`OPS_OFFICER`) | Monitor/verify/assign/escalate, coordinate response |
| Incident Verification Officer (`VERIFICATION_OFFICER`) | Work the report queue: verify, reject, flag duplicates |
| Response Coordinator (`RESPONSE_COORDINATOR`) | Teams, availability, deployments, reassignment |
| Relief & Logistics Officer (`RELIEF_OFFICER`) | Inventory, warehouses, allocations, distributions |
| Shelter Coordinator (`SHELTER_COORDINATOR`) | Capacity, check-in/out, shortages |
| M&E Officer (`ME_OFFICER`) | Analytics, reports, approved exports |
| LGA Emergency Officer (`LGA_OFFICER`) | Local scope only |
| Read-only Executive Viewer (`EXEC_VIEWER`) | Dashboards and summaries, no modification |

External stakeholders (NEMA, FRSC, fire services, health agencies, Red Cross, security agencies, local committees) are **potential** partners subject to formal agreements; no integration is assumed.

## 5. Modules and functional requirements (all implemented)
1. **Command Centre dashboard** — 10 summary metrics, live map, active emergencies, incoming reports, response operations, recent activity, performance indicators, incidents by LGA; date and LGA filters; real-time refresh; DEMO banner when fictional data is present.
2. **Report management** — list/search/filter/sort/paginate, detail, map preview, media viewer (permission-checked), assign verifier, verify, reject (mandatory reason), mark duplicate (linked to original), internal notes, status history, escalate; possible-duplicate suggestions via PostGIS (same category ≤2 km ≤48 h).
3. **Incident management** — create from verified report(s) or manually; link multiple reports; severity (recorded with reason); owner/coordinator (recorded); updates, decisions, evidence; timeline; deploy teams; resolve (summary required, no active deployments); close (summary required); reopen (reason; history preserved).
4. **GIS** — MapLibre GL map, clustering, severity/category/LGA/date/text filters, layer toggles, legend, selection panel, team/shelter/warehouse layers, boundary overlay from PostGIS (empty until verified data imported — no fake geometry).
5. **Response teams** — CRUD, members (single leader), capabilities, equipment, vehicles, availability, history, current deployment, map, filters.
6. **Deployments** — assign (row-locked: no double booking), accept→en route→on site→completed, cancel/reassign with reasons, field updates (challenges, resource requests, escalations), completion report, history.
7. **Affected persons & households** — register, edit, link to incident, duplicate detection, damage & displacement/return/resettlement, individuals; PII masking and audited access; no health data fields.
8. **Relief** — items, warehouses, append-only ledger (receipt, donation, procurement, transfer, damaged, expired, adjustment), reconcile counts, allocations (draft→pending→approved/rejected/fulfilled/cancelled) with segregation of duties, distributions bound to approved allocations, stock and allocation limits, idempotent retries.
9. **Shelters** — register, capacity, check-in/out (capacity never exceeded under concurrency), occupancy history, shortages, status (ACTIVE/FULL/TEMPORARILY_UNAVAILABLE/CLOSED).
10. **Notifications & public alerts** — in-app notification centre; alert workflow DRAFT→PENDING_APPROVAL→APPROVED→PUBLISHED→EXPIRED/CANCELLED with full approval/amendment history; SMS/email/push channels reported honestly as NOT_CONFIGURED until providers exist.
11. **Analytics & exports** — incidents by LGA/ward/category/severity/status/date, response performance, affected population, relief, shelter occupancy; filters; CSV/Excel/PDF exports respecting permission and scope, audited, CSV-injection safe.
12. **Administration** — users, roles, permissions, LGA scope, deactivation, account activity; reference data; settings; immutable audit log; real system health.

## 6. Non-functional requirements
Security (OWASP-aligned controls, Argon2id, short-lived JWT + rotating refresh, lockout, rate limits, secure headers, upload validation by magic bytes); privacy (NDPA 2023 considerations, DPIA-ready); reliability (transactions, optimistic concurrency, idempotency keys, transactional outbox); accessibility (labelled forms, keyboard, focus-trapped dialogs, status never by colour alone, reduced motion); responsive (desktop primary, tablet/mobile usable); performance (server-side pagination/filtering, indexed queries, spatial GiST indexes). Targets (to be validated by load testing): 99.9 % availability, dashboard usable < 3 s under normal load.

## 7. Business rules (enforced server-side and covered by tests)
- A report never becomes an incident without an explicit authorised verification decision.
- Reports can only be linked to an incident once verified; one incident may hold many reports.
- Incident cannot be closed without a resolution summary; cannot be resolved with active deployments; reopening preserves history and requires a reason; severity and ownership changes are recorded.
- A team can have one active deployment; reassignment/cancellation require reasons.
- Inventory is append-only (DB trigger); balance = sum of ledger; distributions must reference an APPROVED allocation and cannot exceed allocation or stock; allocation requester cannot approve; approval accounts for stock committed to other approvals.
- Shelter occupancy cannot exceed capacity; closing an occupied shelter is refused.
- Public alerts cannot be published without approval by someone other than the issuer.
- Audit entries are immutable (DB trigger).

## 8. Permissions
Module- and action-level permissions (e.g. `incidents.verify`, `deployments.assign`, `relief.allocations.approve`, `analytics.export`, `audit.read`) bundled into roles (see `apps/api/src/common/permissions.ts`, single source of truth). Geographical scope via `user_scopes`; roles flagged `scopeRequired` see nothing until an LGA is assigned. The backend authorises every request; the UI only adapts.

## 9. Acceptance criteria
See the root-level checklist in the engineering report and `docs/TESTING.md`; each business rule above maps to an automated test.

## 10. Constraints and assumptions
- Official Kogi **boundaries, wards, communities, shelters, contacts and flood-risk layers were not supplied** and are not fabricated. LGA *names* (21) were checked against public lists; internal LGA codes are **not** official codes.
- Map base tiles default to OpenStreetMap for development only; a licensed provider must be selected before production.
- SMS/email/push providers, S3 storage, backups and hosting/data residency require KOSEMA decisions and credentials.
- Offline-first field operation belongs to the future mobile app; the API is designed for it (stable IDs, server timestamps, versions, idempotency keys).

## 11. Out of scope
The mobile app itself; real provider integrations; legal compliance certification (a DPIA and legal review are required before production); inter-agency data exchange.

## 12. Success metrics
Median report-to-verification time; dispatch time; response (assign→arrival) time; % reports verified within target; zero unauthorised access incidents; zero unreconciled stock variances; audit coverage of critical actions = 100 %.
