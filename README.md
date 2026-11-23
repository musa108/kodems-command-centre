# KODEMS — KOSEMA Web Command Centre

*One State. One Emergency Intelligence Platform.* Monorepo: `apps/api` (NestJS + Prisma 7 + PostgreSQL/PostGIS), `apps/web` (Next.js 15). See `PRD.md`, `Architecture.md`, `Architecture_essential.md`, `Agents.md`, `Claude.md`, and `docs/`.

## Quick start (development)
```bash
npm install
./scripts-start-services.sh               # or: docker compose up -d db redis  (needs PostGIS + Redis)
cp apps/api/.env.example apps/api/.env    # adjust DATABASE_URL, JWT secret
npm -w apps/api run db:generate && npm -w apps/api run db:migrate
npm -w apps/api run db:seed:demo          # reference data + FICTIONAL demo data (never in production)
npm run dev:api   # http://localhost:4000/api/v1   |   npm run dev:web  # http://localhost:3000
```
Demo logins (password `Demo-Passw0rd!2026`): `superadmin@`, `admin@`, `ops@`, `verifier@`, `coordinator@`, `relief@`, `relief2@`, `shelter@`, `me@`, `lga.lokoja@`, `exec@` + `demo.kodems.test`. These exist only where you ran the demo seed.

## Checks
`npm run typecheck && npm run lint && npm test && npm run build`
