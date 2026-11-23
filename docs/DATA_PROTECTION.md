# Data protection (Nigeria Data Protection Act 2023) — design notes

**This document is not legal advice and does not claim compliance.** Technical controls help; compliance also needs governance, a lawful basis per purpose, a DPIA, contracts and a registered DPO process. A **Data Protection Impact Assessment must be completed and reviewed by counsel before production use.**

## Personal data in the system
| Data | Where | Sensitivity | Controls |
|---|---|---|---|
| Staff accounts | `users`, `sessions` | Normal | Argon2id, lockout, MFA, audit of auth events |
| Reporter name/phone (optional) | `incident_reports` | Personal | Only returned to holders of `incidents.verify`; never on maps/lists to others |
| Affected households/persons | `affected_*` | **High (humanitarian)** | Names masked unless `population.pii`; each PII view audited; scope-limited; excluded from exports (households export has no names); no health fields exist |
| Shelter registrations | `shelter_registrations` | High | Masked unless `population.pii` |
| Beneficiaries | `beneficiaries` | High | Separate from affected persons; explicit link only; masked in lists without PII permission |

## Principles implemented
Data minimisation (no health/ID/biometric fields; age band not DOB; sex optional); purpose limitation (separate report/incident/person/beneficiary entities); least privilege (permission + LGA scope); accountability (immutable audit, PII-view logging); integrity (transactions, append-only ledgers); confidentiality (TLS at proxy, secure cookies, headers).

## Retention
`system_settings` key `retention.affected_persons_months` (default 24) records the *policy value*. **No automated purge job exists yet** — implement and test one once the retention period is formally set. Operational history (audit, incidents) is retained by design; deletion of personal data must anonymise rather than break history.

## Rights, breach, access reviews (to be operationalised)
Subject access/erasure requests: process outside the app with an admin export/anonymise runbook (not yet built). Breach response: use audit + auth events to scope; notify per NDPA timelines. Access reviews: quarterly review of `/admin/users` and role assignments.
