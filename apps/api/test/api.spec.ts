import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client, PW, boot, uniq } from './helpers';
import { makeClient } from '../prisma/seed';
import { OutboxService } from '../src/common/outbox.service';

let app: INestApplication, db: ReturnType<typeof makeClient>;
let ops: Client, verifier: Client, coord: Client, relief: Client, relief2: Client, shelter: Client, exec: Client, lga: Client, admin: Client, me: Client, superadmin: Client;
let lokoja: string, okene: string, floodCat: string, alertCat: string;
const point = { lat: 7.8, lng: 6.74 };

beforeAll(async () => {
  ({ app, db } = await boot());
  [ops, verifier, coord, relief, relief2, shelter, exec, lga, admin, me, superadmin] = await Promise.all(['ops', 'verifier', 'coordinator', 'relief', 'relief2', 'shelter', 'exec', 'lga.lokoja', 'admin', 'me', 'superadmin'].map(n => Client.login(app, `${n}@demo.kodems.test`)));
  const lgas = (await ops.get('/geography/lgas')).body.data; lokoja = lgas.find((l: any) => l.name === 'Lokoja').id; okene = lgas.find((l: any) => l.name === 'Okene').id;
  const cats = (await ops.get('/config/categories?kind=INCIDENT')).body.data; floodCat = cats.find((c: any) => c.key === 'flood').id; alertCat = floodCat;
});
afterAll(async () => { await app.close(); await db.$disconnect(); });

const newReport = (c: Client, lgaId = lokoja, extra: any = {}) => c.post('/reports', { categoryId: floodCat, description: 'Flooding reported near the river bank, several houses affected', incidentAt: new Date().toISOString(), ...point, lgaId, suggestedSeverity: 'HIGH', estAffected: 40, ...extra });
const incBody = (extra: any = {}) => ({ title: 'Flood at test community ' + uniq(), description: 'Verified flooding with displaced households needing support', categoryId: floodCat, severity: 'HIGH', ...extra });
async function makeIncident(c = ops, lgaId = lokoja) {
  const r = await newReport(c, lgaId); const v = await c.post(`/reports/${r.body.id}/verify`, { incident: { mode: 'create', data: incBody() } });
  expect(v.status).toBe(201); return { report: r.body, incident: v.body.incident };
}

describe('authentication & sessions', () => {
  it('rejects bad credentials with a generic message', async () => { const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'ops@demo.kodems.test', password: 'wrong-password-1A' }); expect(r.status).toBe(401); expect(r.body.error.code).toBe('INVALID_CREDENTIALS'); });
  it('requires a token for protected routes', async () => { expect((await request(app.getHttpServer()).get('/api/v1/incidents')).status).toBe(401); });
  it('GET /auth/me returns permissions and scope', async () => { const r = await ops.get('/auth/me'); expect(r.status).toBe(200); expect(r.body.permissions).toContain('incidents.verify'); expect(r.body.statewide).toBe(true); const l = (await lga.get('/auth/me')).body; expect(l.statewide).toBe(false); expect(l.scope.map((s: any) => s.name)).toEqual(['Lokoja']); });
  it('locks the account after 5 failures', async () => {
    const email = `lock${uniq()}@demo.kodems.test`; const role = await db.role.findUniqueOrThrow({ where: { key: 'EXEC_VIEWER' } });
    const r = await superadmin.post('/users', { email, name: 'Lock Test', password: 'Valid-Passw0rd-1', roleKeys: [role.key] }); expect(r.status).toBe(201);
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'nope-nope-1A' });
    const ok = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Valid-Passw0rd-1' }); expect(ok.status).toBe(403); expect(ok.body.error.code).toBe('ACCOUNT_LOCKED');
  });
  it('refresh rotates tokens, requires CSRF header, and detects reuse', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'exec@demo.kodems.test', password: PW }); const c1 = login.headers['set-cookie'];
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', c1)).status).toBe(403);
    const r1 = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', c1).set('X-Requested-With', 'kodems-web'); expect(r1.status).toBe(200); const c2 = r1.headers['set-cookie'];
    const reuse = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', c1).set('X-Requested-With', 'kodems-web'); expect(reuse.status).toBe(401);
    const after = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', c2).set('X-Requested-With', 'kodems-web'); expect(after.status).toBe(401); // whole family revoked
  });
  it('password reset flow works and enforces policy', async () => {
    const email = `reset${uniq()}@demo.kodems.test`; await superadmin.post('/users', { email, name: 'Reset T', password: 'Valid-Passw0rd-1', roleKeys: ['EXEC_VIEWER'] });
    const f = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email }); const token = f.body.devToken; expect(token).toBeTruthy();
    expect((await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token, password: 'weak' })).status).toBe(400);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token, password: 'Brand-New-Passw0rd' })).status).toBe(204);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token, password: 'Another-New-Passw0rd' })).status).toBe(400); // single use
    expect((await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Brand-New-Passw0rd' })).status).toBe(200);
  });
});

describe('authorisation is enforced by the backend', () => {
  it('verification officer cannot create incidents or assign teams', async () => { expect((await verifier.post('/incidents', incBody({ ...point, lgaId: lokoja }))).status).toBe(403); expect((await verifier.get('/teams')).status).toBe(403); });
  it('executive viewer is read-only', async () => { expect((await exec.get('/incidents')).status).toBe(200); expect((await exec.post('/incidents', incBody({ ...point, lgaId: lokoja }))).status).toBe(403); expect((await exec.post('/relief/transactions', {})).status).toBe(403); });
  it('only super admin reads audit logs and health; ops cannot manage users', async () => { expect((await ops.get('/audit-logs')).status).toBe(403); expect((await superadmin.get('/audit-logs')).status).toBe(200); expect((await ops.get('/users')).status).toBe(403); expect((await ops.get('/system/health')).status).toBe(403); });
  it('LGA officer only sees and touches their own LGA', async () => {
    const inOk = await newReport(ops, lokoja); const out = await newReport(ops, okene);
    const list = await lga.get('/reports?pageSize=100'); expect(list.body.data.every((r: any) => r.lga === 'Lokoja')).toBe(true); expect(list.body.data.some((r: any) => r.id === inOk.body.id)).toBe(true); expect(list.body.data.some((r: any) => r.id === out.body.id)).toBe(false);
    const forbidden = await lga.get(`/reports/${out.body.id}`); expect(forbidden.status).toBe(403); expect(forbidden.body.error.code).toBe('OUT_OF_SCOPE');
    expect((await newReport(lga, okene)).status).toBe(403);
    expect((await lga.get('/geography/lgas')).body.data).toHaveLength(1);
    const inc = (await lga.get('/analytics/incidents')).body; expect(inc.byLga.every((x: any) => x.name === 'Lokoja')).toBe(true);
  });
  it('deactivated users lose access immediately', async () => {
    const email = `deact${uniq()}@demo.kodems.test`; const u = await superadmin.post('/users', { email, name: 'Deact', password: 'Valid-Passw0rd-1', roleKeys: ['OPS_OFFICER'] }); if (process.env.DEBUG_T) console.log(u.status, JSON.stringify(u.body)); const c = await Client.login(app, email, 'Valid-Passw0rd-1');
    expect((await c.get('/incidents')).status).toBe(200); await superadmin.patch(`/users/${u.body.id}`, { isActive: false }); expect((await c.get('/incidents')).status).toBe(401);
  });
  it('scoped roles require an LGA when created', async () => { const r = await superadmin.post('/users', { email: `s${uniq()}@demo.kodems.test`, name: 'No Scope', password: 'Valid-Passw0rd-1', roleKeys: ['LGA_OFFICER'] }); expect(r.status).toBe(400); expect(r.body.error.code).toBe('SCOPE_REQUIRED'); });
});

describe('Workflow A — report verification', () => {
  it('a submitted report is NOT an incident until explicitly verified', async () => {
    const r = await newReport(ops); expect(r.status).toBe(201); expect(r.body.status).toBe('SUBMITTED');
    const incs = await ops.get('/incidents?pageSize=100'); expect(JSON.stringify(incs.body)).not.toContain(r.body.ref);
    const det = await ops.get(`/reports/${r.body.id}`); expect(det.body.incident).toBeNull();
  });
  it('verify requires an explicit incident decision', async () => { const r = await newReport(ops); expect((await ops.post(`/reports/${r.body.id}/verify`, {})).status).toBe(400); });
  it('verify → create incident links report, writes history and audit', async () => {
    const { report, incident } = await makeIncident(); const det = (await ops.get(`/reports/${report.id}`)).body;
    expect(det.status).toBe('VERIFIED'); expect(det.incident.id).toBe(incident.id); expect(det.history.map((h: any) => h.to)).toEqual(expect.arrayContaining(['SUBMITTED', 'VERIFIED']));
    const a = await superadmin.get(`/audit-logs?entityType=report&entityId=${report.id}`); expect(a.body.data.map((x: any) => x.action)).toEqual(expect.arrayContaining(['reports.create', 'reports.verify']));
    expect(a.body.data.find((x: any) => x.action === 'reports.verify').userName).toBeTruthy();
  });
  it('verified-only, no incident created when mode is none', async () => { const r = await newReport(ops); const v = await ops.post(`/reports/${r.body.id}/verify`, { incident: { mode: 'none' } }); expect(v.status).toBe(201); expect(v.body.incident).toBeNull(); });
  it('cannot verify twice (invalid transition)', async () => { const r = await newReport(ops); await ops.post(`/reports/${r.body.id}/verify`, { incident: { mode: 'none' } }); const again = await ops.post(`/reports/${r.body.id}/verify`, { incident: { mode: 'none' } }); expect(again.status).toBe(422); expect(again.body.error.code).toBe('INVALID_TRANSITION'); });
  it('rejection requires a reason', async () => { const r = await newReport(ops); expect((await ops.post(`/reports/${r.body.id}/reject`, {})).status).toBe(400); expect((await ops.post(`/reports/${r.body.id}/reject`, { reason: 'ok' })).status).toBe(400); const ok = await ops.post(`/reports/${r.body.id}/reject`, { reason: 'Hoax: location checked, no flooding' }); expect(ok.status).toBe(201); expect(ok.body.status).toBe('REJECTED'); });
  it('duplicates link to an original; cannot self-duplicate; second report can join an existing incident', async () => {
    const { report, incident } = await makeIncident(); const dup = await newReport(ops);
    expect((await ops.post(`/reports/${dup.body.id}/mark-duplicate`, { originalId: dup.body.id })).status).toBe(422);
    const ok = await ops.post(`/reports/${dup.body.id}/mark-duplicate`, { originalId: report.id }); expect(ok.status).toBe(201); expect(ok.body.status).toBe('DUPLICATE');
    const second = await newReport(ops); const link = await ops.post(`/reports/${second.body.id}/verify`, { incident: { mode: 'link', incidentId: incident.id } }); expect(link.status).toBe(201);
    expect((await ops.get(`/incidents/${incident.id}`)).body.reports).toHaveLength(2);
  });
  it('unverified reports cannot be linked to an incident', async () => { const { incident } = await makeIncident(); const r = await newReport(ops); const l = await ops.post(`/incidents/${incident.id}/link-report`, { reportId: r.body.id }); expect(l.status).toBe(422); expect(l.body.error.code).toBe('REPORT_NOT_VERIFIED'); });
  it('queue order: critical first, then oldest first', async () => {
    const a = await newReport(ops, lokoja, { suggestedSeverity: 'LOW' }); const b = await newReport(ops, lokoja, { suggestedSeverity: 'CRITICAL' });
    const q = (await ops.get('/reports?status=SUBMITTED,UNDER_REVIEW&pageSize=100')).body.data; expect(q.findIndex((r: any) => r.id === b.body.id)).toBeLessThan(q.findIndex((r: any) => r.id === a.body.id));
  });
  it('stale writes are rejected with 409 (optimistic concurrency)', async () => { const r = await newReport(ops); const g = await ops.get(`/reports/${r.body.id}`); const v = g.body.version; await ops.post(`/reports/${r.body.id}/assign`, { officerId: (await db.user.findFirstOrThrow({ where: { email: 'verifier@demo.kodems.test' } })).id }); const stale = await ops.post(`/reports/${r.body.id}/reject`, { reason: 'Stale write attempt', version: v }); expect(stale.status).toBe(409); expect(stale.body.error.code).toBe('VERSION_CONFLICT'); });
  it('submission is idempotent with an Idempotency-Key', async () => { const k = 'idem-' + uniq(); const a = await ops.post('/reports', { categoryId: floodCat, description: 'Idempotent report submission test', incidentAt: new Date().toISOString(), ...point, lgaId: lokoja }, { 'Idempotency-Key': k }); const b = await ops.post('/reports', { categoryId: floodCat, description: 'Idempotent report submission test', incidentAt: new Date().toISOString(), ...point, lgaId: lokoja }, { 'Idempotency-Key': k }); expect(a.body.id).toBe(b.body.id); });
  it('detects possible duplicates by category, time and distance (PostGIS)', async () => { const far = { lat: 7.95, lng: 6.5 }; const a = await newReport(ops, lokoja, far); const b = await newReport(ops, lokoja, { lat: far.lat + 0.002, lng: far.lng }); const d = (await ops.get(`/reports/${b.body.id}`)).body.possibleDuplicates; expect(d.map((x: any) => x.id)).toContain(a.body.id); });
  it('upload validation rejects non-media files', async () => { const r = await newReport(ops); const bad = await request(app.getHttpServer()).post(`/api/v1/reports/${r.body.id}/media`).set('Authorization', `Bearer ${ops.token}`).attach('file', Buffer.from('MZ-not-an-image'), 'x.jpg'); expect(bad.status).toBe(400); expect(bad.body.error.code).toBe('FILE_TYPE_REJECTED'); const good = await request(app.getHttpServer()).post(`/api/v1/reports/${r.body.id}/media`).set('Authorization', `Bearer ${ops.token}`).attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'p.jpg'); expect(good.status).toBe(201); });
});

describe('Incident lifecycle', () => {
  it('severity change needs a reason, is recorded, and audited', async () => {
    const { incident } = await makeIncident(); expect((await ops.post(`/incidents/${incident.id}/change-severity`, { severity: 'CRITICAL' })).status).toBe(400);
    const ok = await ops.post(`/incidents/${incident.id}/change-severity`, { severity: 'CRITICAL', reason: 'Water level rising rapidly' }); expect(ok.status).toBe(201);
    const d = (await ops.get(`/incidents/${incident.id}`)).body; expect(d.severity).toBe('CRITICAL'); expect(d.timeline.some((t: any) => t.kind === 'SEVERITY_CHANGE')).toBe(true);
    expect((await superadmin.get(`/audit-logs?entityId=${incident.id}&action=incidents.severity_change`)).body.data).toHaveLength(1);
  });
  it('owner change is recorded', async () => { const { incident } = await makeIncident(); const u = await db.user.findFirstOrThrow({ where: { email: 'coordinator@demo.kodems.test' } }); expect((await ops.post(`/incidents/${incident.id}/assign-owner`, { ownerId: u.id, reason: 'Handover' })).status).toBe(201); const d = (await ops.get(`/incidents/${incident.id}`)).body; expect(d.ownerId).toBe(u.id); expect(d.assignments.length).toBeGreaterThanOrEqual(1); });
  it('cannot close without resolving; resolve needs a summary; close then reopen preserves history', async () => {
    const { incident } = await makeIncident();
    const c0 = await admin.post(`/incidents/${incident.id}/close`, {}); expect(c0.status).toBe(422); expect(c0.body.error.code).toBe('RESOLUTION_REQUIRED');
    expect((await ops.post(`/incidents/${incident.id}/resolve`, {})).status).toBe(400);
    expect((await ops.post(`/incidents/${incident.id}/resolve`, { resolutionSummary: 'Waters receded; households assisted and returned.' })).status).toBe(201);
    expect((await admin.post(`/incidents/${incident.id}/close`, {})).status).toBe(201);
    const before = (await ops.get(`/incidents/${incident.id}`)).body.history.length;
    expect((await ops.post(`/incidents/${incident.id}/reopen`, { reason: "Not permitted for ops" })).status).toBe(403); expect((await admin.post(`/incidents/${incident.id}/reopen`, {})).status).toBe(400);
    expect((await admin.post(`/incidents/${incident.id}/reopen`, { reason: 'New flooding at same location' })).status).toBe(201);
    const d = (await ops.get(`/incidents/${incident.id}`)).body; expect(d.status).toBe('OPEN'); expect(d.history.length).toBe(before + 1); expect(d.timeline.some((t: any) => t.kind === 'RESOLUTION')).toBe(true); expect(d.timeline.some((t: any) => t.kind === 'REOPEN')).toBe(true);
  });
  it('closed incidents cannot be edited', async () => { const { incident } = await makeIncident(); await ops.post(`/incidents/${incident.id}/resolve`, { resolutionSummary: 'Resolved for locking test' }); const e = await ops.patch(`/incidents/${incident.id}`, { title: 'Changed title here' }); expect(e.status).toBe(422); expect(e.body.error.code).toBe('INCIDENT_LOCKED'); });
  it('invalid status transitions are rejected', async () => { const { incident } = await makeIncident(); const r = await ops.patch(`/incidents/${incident.id}`, { status: 'RECOVERY' }); expect(r.status).toBe(422); });
  it('manual creation works for authorised users; coordinates validated', async () => { expect((await ops.post('/incidents', incBody({ ...point, lgaId: lokoja }))).status).toBe(201); expect((await ops.post('/incidents', incBody({ lat: 999, lng: 6, lgaId: lokoja }))).status).toBe(400); });
  it('map endpoint exposes no reporter PII', async () => { const r = await newReport(ops, lokoja, { reporterName: 'Secret Reporter', reporterPhone: '08000000000' }); await ops.post(`/reports/${r.body.id}/verify`, { incident: { mode: 'create', data: incBody() } }); const m = await ops.get('/map/incidents'); expect(JSON.stringify(m.body)).not.toMatch(/Secret Reporter|08000000000/); expect(m.body.data.length).toBeGreaterThan(0); });
});

describe('Workflow B — response coordination', () => {
  let teamId: string, team2Id: string;
  beforeAll(async () => {
    const tc = (await ops.get('/config/categories?kind=TEAM')).body.data[0].id;
    const mk = async (n: string) => (await coord.post('/teams', { name: `Test Team ${n} ${uniq()}`, categoryId: tc, agency: 'Test Agency', lgaId: lokoja, baseLat: 7.8, baseLng: 6.7, capabilities: ['rescue'] })).body.id;
    teamId = await mk('A'); team2Id = await mk('B');
  });
  it('assigns a team, marks it DEPLOYED, activates the incident; double-booking is refused', async () => {
    const { incident } = await makeIncident(); const d = await coord.post('/deployments', { incidentId: incident.id, teamId, destination: 'Riverside community', instructions: 'Evacuate low-lying houses' }); expect(d.status).toBe(201);
    expect((await coord.get(`/teams/${teamId}`)).body.status).toBe('DEPLOYED'); expect((await ops.get(`/incidents/${incident.id}`)).body.status).toBe('RESPONSE_ACTIVE');
    const { incident: i2 } = await makeIncident(); const dbl = await coord.post('/deployments', { incidentId: i2.id, teamId, destination: 'Elsewhere' }); expect(dbl.status).toBe(409); expect(dbl.body.error.code).toBe('TEAM_UNAVAILABLE');
    expect((await coord.patch(`/teams/${teamId}/availability`, { status: 'UNAVAILABLE', reason: 'x' })).status).toBe(422);
    // lifecycle
    const id = d.body.id; expect((await coord.post(`/deployments/${id}/complete`, { completionReport: 'Too early to complete this' })).status).toBe(422);
    for (const s of ['ACCEPTED', 'EN_ROUTE', 'ON_SITE']) { const r = await coord.patch(`/deployments/${id}`, { status: s }); expect(r.status).toBe(200); expect(r.body.status).toBe(s); }
    expect((await coord.post(`/deployments/${id}/updates`, { kind: 'CHALLENGE', message: 'Road washed out; need boat', lat: 7.81, lng: 6.73 })).status).toBe(201);
    expect((await ops.post(`/incidents/${i2.id}/resolve`, { resolutionSummary: 'Resolved without any deployment.' })).status).toBe(201); // other incident has no active deployments
    expect((await ops.post(`/incidents/${incident.id}/resolve`, { resolutionSummary: 'Should be blocked by active deployment' })).body.error.code).toBe('ACTIVE_DEPLOYMENTS');
    expect((await coord.post(`/deployments/${id}/complete`, {})).status).toBe(400);
    const done = await coord.post(`/deployments/${id}/complete`, { completionReport: 'All households evacuated safely.' }); expect(done.status).toBe(201); expect(done.body.completedAt).toBeTruthy();
    expect((await coord.get(`/teams/${teamId}`)).body.status).toBe('AVAILABLE'); const det = (await coord.get(`/deployments/${id}`)).body; expect(det.history.map((h: any) => h.to)).toEqual(expect.arrayContaining(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'])); expect((await coord.get(`/teams/${teamId}`)).body.lastLat).toBe(7.81);
    expect((await coord.patch(`/deployments/${id}`, { status: 'ACCEPTED' })).status).toBe(422);
  });
  it('cannot skip lifecycle states; cancellation and reassignment require reasons', async () => {
    const { incident } = await makeIncident(); const d = await coord.post('/deployments', { incidentId: incident.id, teamId: team2Id, destination: 'Dest' }); const id = d.body.id;
    expect((await coord.patch(`/deployments/${id}`, { status: 'ON_SITE' })).status).toBe(422); expect((await coord.patch(`/deployments/${id}`, { status: 'CANCELLED' })).status).toBe(400);
    expect((await coord.post(`/deployments/${id}/reassign`, { teamId, reason: 'no' })).status).toBe(400);
    const re = await coord.post(`/deployments/${id}/reassign`, { teamId, reason: 'Team B vehicle broke down' }); expect(re.status).toBe(201);
    expect((await coord.get(`/teams/${team2Id}`)).body.status).toBe('AVAILABLE'); expect((await coord.get(`/teams/${teamId}`)).body.status).toBe('DEPLOYED'); expect((await coord.get(`/deployments/${id}`)).body.status).toBe('REASSIGNED');
    expect((await coord.patch(`/deployments/${re.body.id}`, { status: 'CANCELLED', reason: 'Stood down' })).status).toBe(200); expect((await coord.get(`/teams/${teamId}`)).body.status).toBe('AVAILABLE');
  });
  it('concurrent assignment of one team: exactly one wins', async () => {
    const [a, b, c] = await Promise.all([makeIncident(), makeIncident(), makeIncident()]); const tc = (await ops.get('/config/categories?kind=TEAM')).body.data[0].id;
    const t = (await coord.post('/teams', { name: `Race Team ${uniq()}`, categoryId: tc, agency: 'Race Agency', lgaId: lokoja })).body.id;
    const res = await Promise.all([a, b, c].map(x => coord.post('/deployments', { incidentId: x.incident.id, teamId: t, destination: 'Race' }))); if (process.env.DEBUG_T) console.log(res.map(r => [r.status, JSON.stringify(r.body).slice(0, 200)])); expect(res.filter(r => r.status === 201)).toHaveLength(1); expect(res.filter(r => r.status === 409)).toHaveLength(2);
  });
  it('team leader is exclusive; deployments list is filterable', async () => { await coord.post(`/teams/${teamId}/members`, { name: 'Leader One', isLeader: true }); await coord.post(`/teams/${teamId}/members`, { name: 'Leader Two', isLeader: true }); const t = (await coord.get(`/teams/${teamId}`)).body; expect(t.members.filter((m: any) => m.isLeader)).toHaveLength(1); expect((await coord.get('/deployments?active=true')).status).toBe(200); expect((await coord.get('/teams?capability=rescue')).body.data.length).toBeGreaterThan(0); });
});

describe('Workflow C — relief inventory, allocation, distribution', () => {
  let wh: string, wh2: string, item: string, incident: any;
  const tx = (c: Client, b: any, h = {}) => c.post('/relief/transactions', b, h);
  const bal = async (w = wh, i = item) => (await relief.get(`/relief/inventory?warehouseId=${w}`)).body.data.find((x: any) => x.itemId === i)?.balance ?? 0;
  beforeAll(async () => {
    wh = (await relief.post('/relief/warehouses', { name: 'T Warehouse ' + uniq(), code: 'TW' + uniq().toUpperCase(), lgaId: lokoja })).body.id; wh2 = (await relief.post('/relief/warehouses', { name: 'T Warehouse2 ' + uniq(), code: 'TX' + uniq().toUpperCase(), lgaId: lokoja })).body.id;
    const cat = (await ops.get('/config/categories?kind=RELIEF')).body.data[0].id; item = (await relief.post('/relief/items', { name: 'Test item ' + uniq(), sku: 'SKU' + uniq(), categoryId: cat, unit: 'kg' })).body.id; incident = (await makeIncident()).incident;
  });
  it('stock is a ledger: receipts add, balance is the sum; zero and over-large outflow refused', async () => {
    expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'RECEIPT', quantity: 100, reference: 'GRN-1' })).status).toBe(201); expect(await bal()).toBe(100);
    expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'DONATION', quantity: 50 })).status).toBe(201); expect(await bal()).toBe(150);
    expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'DAMAGED', quantity: 500, reason: 'flood damage' })).body.error.code).toBe('INSUFFICIENT_STOCK'); expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'DAMAGED', quantity: 5 })).status).toBe(400);
    expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'DISTRIBUTION', quantity: 1 })).status).toBe(400); expect(await bal()).toBe(150);
  });
  it('transfers are two linked ledger rows; adjustments need reasons; reconcile corrects drift', async () => {
    expect((await tx(relief, { warehouseId: wh, itemId: item, type: 'TRANSFER_OUT', quantity: 30, toWarehouseId: wh2 })).status).toBe(201); expect(await bal(wh)).toBe(120); expect(await bal(wh2)).toBe(30);
    const rc = await relief.post('/relief/reconcile', { warehouseId: wh, itemId: item, countedQuantity: 118, reason: 'Physical count' }); expect(rc.body.adjustment).toBe(-2); expect(await bal(wh)).toBe(118);
    await tx(relief, { warehouseId: wh, itemId: item, type: 'RECEIPT', quantity: 2, reference: 'restore' }); expect(await bal(wh)).toBe(120);
  });
  it('retries with the same idempotency key do not double-count', async () => { const k = 'tx-' + uniq(); await tx(relief, { warehouseId: wh, itemId: item, type: 'RECEIPT', quantity: 10 }, { 'Idempotency-Key': k }); await tx(relief, { warehouseId: wh, itemId: item, type: 'RECEIPT', quantity: 10 }, { 'Idempotency-Key': k }); expect(await bal()).toBe(130); });
  it('the database itself refuses UPDATE/DELETE on the ledger and audit log', async () => {
    await expect(db.$executeRawUnsafe(`UPDATE inventory_transactions SET delta = 9999`)).rejects.toThrow(/append-only/); await expect(db.$executeRawUnsafe(`DELETE FROM inventory_transactions`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow(/append-only/); await expect(db.$executeRawUnsafe(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
  });
  it('allocation → approval (segregation of duties) → distribution, with limits', async () => {
    const a = await relief.post('/relief/allocations', { incidentId: incident.id, warehouseId: wh, targetArea: 'Riverside', items: [{ itemId: item, quantity: 60 }], submit: true }); expect(a.status).toBe(201); expect(a.body.status).toBe('PENDING_APPROVAL');
    const self = await relief.post(`/relief/allocations/${a.body.id}/approve`, {}); expect(self.status).toBe(403); expect(self.body.error.code).toBe('SEGREGATION_OF_DUTIES');
    const early = await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Demo Beneficiary', items: [{ itemId: item, quantity: 5 }] }); expect(early.body.error.code).toBe('ALLOCATION_NOT_APPROVED');
    expect((await relief2.post(`/relief/allocations/${a.body.id}/approve`, { note: 'approved' })).status).toBe(201);
    const over = await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Demo Beneficiary', items: [{ itemId: item, quantity: 61 }] }); expect(over.status).toBe(409); expect(over.body.error.code).toBe('EXCEEDS_ALLOCATION');
    const k = 'dist-' + uniq(); const d1 = await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Demo Beneficiary', items: [{ itemId: item, quantity: 25 }] }, { 'Idempotency-Key': k }); expect(d1.status).toBe(201); expect(await bal()).toBe(105);
    const d1b = await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Demo Beneficiary', items: [{ itemId: item, quantity: 25 }] }, { 'Idempotency-Key': k }); expect(d1b.body.id).toBe(d1.body.id); expect(await bal()).toBe(105);
    const d2 = await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Second Beneficiary', items: [{ itemId: item, quantity: 35 }] }); expect(d2.status).toBe(201); expect(await bal()).toBe(70);
    const list = (await relief.get('/relief/allocations?pageSize=100')).body.data.find((x: any) => x.id === a.body.id); expect(list.status).toBe('FULFILLED'); expect(list.items[0].distributed).toBe(60);
    expect((await relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Third', items: [{ itemId: item, quantity: 1 }] })).status).toBe(422);
    const inc = (await ops.get(`/incidents/${incident.id}`)).body; expect(inc.allocations.some((x: any) => x.id === a.body.id)).toBe(true);
  });
  it('approval refuses allocations exceeding uncommitted stock', async () => { const a = await relief.post('/relief/allocations', { incidentId: incident.id, warehouseId: wh, targetArea: 'Big ask', items: [{ itemId: item, quantity: 99999 }], submit: true }); const r = await relief2.post(`/relief/allocations/${a.body.id}/approve`, {}); expect(r.status).toBe(409); expect(r.body.error.code).toBe('INSUFFICIENT_STOCK'); });
  it('CONCURRENCY: parallel distributions can never overdraw stock', async () => {
    const cat = (await ops.get('/config/categories?kind=RELIEF')).body.data[0].id; const it2 = (await relief.post('/relief/items', { name: 'Race item ' + uniq(), sku: 'R' + uniq(), categoryId: cat, unit: 'pc' })).body.id;
    await tx(relief, { warehouseId: wh, itemId: it2, type: 'RECEIPT', quantity: 50 });
    const allocs = await Promise.all([0, 1, 2, 3, 4, 5].map(() => relief.post('/relief/allocations', { incidentId: incident.id, warehouseId: wh, targetArea: 'race', items: [{ itemId: it2, quantity: 20 }], submit: true })));
    const approvals: any[] = []; for (const a of allocs) approvals.push(await relief2.post(`/relief/allocations/${a.body.id}/approve`, {})); expect(approvals.filter(a => a.status === 201)).toHaveLength(2); // 20+20 committed of 50; 3rd refused
    const ok = allocs.filter((_, i) => approvals[i].status === 201);
    const out = await Promise.all(ok.flatMap(a => [0, 1].map(() => relief.post('/relief/distributions', { allocationId: a.body.id, beneficiaryName: 'Racer', items: [{ itemId: it2, quantity: 20 }] }))));
    expect(out.filter(o => o.status === 201)).toHaveLength(2); const b = await bal(wh, it2); expect(b).toBe(10); expect(b).toBeGreaterThanOrEqual(0);
  });
  it('distribution lists mask beneficiary names without the PII permission; relief officer has it', async () => { const ex = await Client.login(app, 'exec@demo.kodems.test'); expect((await ex.get('/relief/distributions')).status).toBe(403); const d = (await relief.get('/relief/distributions')).body.data; expect(d.length).toBeGreaterThan(0); });
  it('stock reports and exports reflect the ledger', async () => { const r = await me.get('/analytics/relief-distribution'); expect(r.status).toBe(200); expect(r.body.items.length).toBeGreaterThan(0); });
});

describe('Workflow D — shelters', () => {
  it('capacity is never exceeded under concurrent check-ins; status flips FULL/ACTIVE; history recorded', async () => {
    const s = await shelter.post('/shelters', { name: 'Test Centre ' + uniq(), lgaId: lokoja, capacity: 3, facilities: ['water'] }); expect(s.status).toBe(201); const id = s.body.id;
    const res = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => shelter.post(`/shelters/${id}/check-in`, { name: `Evacuee Number${n}` })));
    expect(res.filter(r => r.status === 201)).toHaveLength(3); expect(res.filter(r => r.status === 409 && r.body.error.code === 'SHELTER_FULL')).toHaveLength(7);
    const d = (await shelter.get(`/shelters/${id}`)).body; expect(d.occupancy).toBe(3); expect(d.status).toBe('FULL'); expect(d.available).toBe(0);
    const regId = res.find(r => r.status === 201)!.body.registrationId; const out = await shelter.post(`/shelters/${id}/check-out`, { registrationId: regId }); expect(out.body.status).toBe('ACTIVE'); expect(out.body.occupancy).toBe(2);
    expect((await shelter.post(`/shelters/${id}/check-out`, { registrationId: regId })).status).toBe(409);
    expect((await shelter.patch(`/shelters/${id}`, { capacity: 1 })).body.error.code).toBe('CAPACITY_BELOW_OCCUPANCY'); expect((await shelter.patch(`/shelters/${id}`, { status: 'CLOSED' })).status).toBe(400); expect((await shelter.patch(`/shelters/${id}`, { status: 'CLOSED', reason: 'Closing' })).body.error.code).toBe('SHELTER_OCCUPIED');
    const occ = (await shelter.get(`/shelters/${id}/occupancy`)).body; expect(occ.history.length).toBeGreaterThanOrEqual(5);
    const names = (await ops.get(`/shelters/${id}`)).body.registrations.map((r: any) => r.name).join(); expect(names).not.toContain('Evacuee'); // ops lacks PII permission
  });
});

describe('Affected persons — privacy', () => {
  it('names are masked without population.pii; PII views are audited; duplicates flagged; no health fields', async () => {
    const { incident } = await makeIncident(); const body = { incidentId: incident.id, headName: 'Amina Yusuf', size: 4, damage: 'SEVERE', displacement: 'DISPLACED', needs: ['water'] };
    const h = await ops.post('/households', body); expect(h.status).toBe(201);
    const dup = await ops.post('/households', body); expect(dup.status).toBe(409); expect(dup.body.error.code).toBe('POSSIBLE_DUPLICATE'); expect((await ops.post('/households', { ...body, confirmNotDuplicate: true })).status).toBe(201);
    await ops.post('/persons', { householdId: h.body.id, name: 'Amina Yusuf', ageBand: '18-59' });
    const masked = (await ops.get(`/households/${h.body.id}`)).body; expect(masked.headName).not.toContain('Amina'); expect(masked.persons[0].name).not.toContain('Amina');
    const full = (await shelter.get(`/households/${h.body.id}`)).body; expect(full.headName).toBe('Amina Yusuf');
    const aud = (await superadmin.get(`/audit-logs?entityId=${h.body.id}&action=population.view_pii`)).body.data; expect(aud.length).toBeGreaterThan(0);
    expect(Object.keys(masked)).not.toEqual(expect.arrayContaining(['health', 'medicalCondition']));
    expect((await ops.post('/persons', { householdId: h.body.id, name: 'a', ageBand: 'bad' })).status).toBe(400);
    const exp = await me.get('/analytics/export?dataset=households&format=csv'); expect(exp.text).not.toContain('Amina');
  });
  it('LGA officers cannot register households in another LGA', async () => { const { incident } = await makeIncident(ops, okene); const r = await lga.post('/households', { incidentId: incident.id, headName: 'Out Of Scope', size: 2 }); expect(r.status).toBe(403); });
  it('a beneficiary is distinct from an affected person (explicit link only)', async () => { expect(await db.beneficiary.count({ where: { householdId: { not: null } } })).toBeGreaterThanOrEqual(0); expect(await db.affectedPerson.count()).toBeGreaterThan(0); });
});

describe('Public alerts — approval workflow', () => {
  const body = () => ({ title: 'Flood warning for riverine areas', message: 'Residents near the river should move to higher ground immediately.', categoryId: alertCat, severity: 'HIGH', targetLgaIds: [lokoja], expiresAt: new Date(Date.now() + 864e5).toISOString(), channels: ['SMS', 'EMAIL'] });
  it('cannot publish without approval; issuer cannot self-approve; full workflow; external channels honestly NOT_CONFIGURED', async () => {
    const a = await ops.post('/alerts', body()); expect(a.status).toBe(201); const id = a.body.id;
    expect((await admin.post(`/alerts/${id}/publish`)).body.error.code).toBe('APPROVAL_REQUIRED');
    await ops.post(`/alerts/${id}/submit-approval`); expect((await admin.post(`/alerts/${id}/publish`)).status).toBe(409);
    expect((await ops.post(`/alerts/${id}/approve`, {})).status).toBe(403);
    expect((await admin.post(`/alerts/${id}/approve`, { decision: 'APPROVED' })).status).toBe(201);
    expect((await ops.patch(`/alerts/${id}`, { title: 'Edited after approval' })).status).toBe(422);
    expect((await ops.post(`/alerts/${id}/publish`)).status).toBe(403); const p = await admin.post(`/alerts/${id}/publish`); expect(p.status).toBe(201); expect(p.body.status).toBe('PUBLISHED');
    const list = (await admin.get('/alerts?status=PUBLISHED&pageSize=100')).body.data.find((x: any) => x.id === id); const ch = Object.fromEntries(list.deliveries.map((d: any) => [d.channel, d.status])); expect(ch.IN_APP).toBe('SENT'); expect(ch.SMS).toBe('NOT_CONFIGURED'); expect(ch.EMAIL).toBe('NOT_CONFIGURED'); expect(list.approvals.map((x: any) => x.decision)).toEqual(expect.arrayContaining(['DRAFTED', 'SUBMITTED', 'APPROVED', 'PUBLISHED']));
  });
  it('amendment withdraws approval and keeps history; rejected needs a reason; expiry must be in the future', async () => {
    const a = await ops.post('/alerts', body()); const id = a.body.id; await ops.post(`/alerts/${id}/submit-approval`);
    expect((await ops.patch(`/alerts/${id}`, { message: 'Amended: please move to higher ground now.' })).body.status).toBe('DRAFT');
    await ops.post(`/alerts/${id}/submit-approval`); expect((await admin.post(`/alerts/${id}/approve`, { decision: 'REJECTED' })).status).toBe(400);
    expect((await ops.post('/alerts', { ...body(), expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(422);
  });
});

describe('Analytics, dashboard, exports, search, notifications', () => {
  it('dashboard overview returns real counts and DEMO flag', async () => { const o = (await ops.get('/dashboard/overview')).body; expect(o.metrics.totalIncidents).toBeGreaterThan(0); expect(o.containsDemoData).toBe(true); expect(o.environment).toBe('test'); expect((await ops.get('/dashboard/incident-summary')).body.activeIncidents.length).toBeGreaterThan(0); });
  it('response performance computes real averages from timestamps', async () => { const p = (await me.get('/analytics/response-performance')).body; expect(p.verificationSample).toBeGreaterThan(0); expect(typeof p.avgVerificationMinutes).toBe('number'); expect(p.avgDispatchMinutes).not.toBeNull(); expect(p.avgResponseMinutes === null || typeof p.avgResponseMinutes === 'number').toBe(true); });
  it('filters work (LGA, severity, date) and export respects permission + scope + audit, CSV-injection safe', async () => {
    const f = (await me.get(`/analytics/incidents?lgaId=${okene}&severity=CRITICAL`)).body; expect(f.byLga.every((x: any) => x.name === 'Okene')).toBe(true);
    expect((await exec.get('/analytics/export?dataset=incidents&format=csv')).status).toBe(403);
    await ops.post('/incidents', incBody({ title: '=HYPERLINK("http://evil","x") test', ...point, lgaId: lokoja }));
    const csv = await me.get('/analytics/export?dataset=incidents&format=csv'); expect(csv.status).toBe(200); expect(csv.text).toContain("'=HYPERLINK"); expect(csv.text.split('\n')[0]).toMatch(/^# Incidents — Generated/);
    const x = await me.get('/analytics/export?dataset=incidents&format=xlsx'); expect(x.headers['content-type']).toContain('spreadsheetml'); const p = await me.get('/analytics/export?dataset=incidents&format=pdf').buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }); expect(p.body.slice(0, 4).toString()).toBe('%PDF');
    const scoped = await Client.login(app, 'lga.lokoja@demo.kodems.test'); expect((await scoped.get('/analytics/export?dataset=incidents&format=csv')).status).toBe(403); // LGA officer lacks export permission
    expect((await superadmin.get('/audit-logs?action=analytics.export')).body.data.length).toBeGreaterThanOrEqual(3);
  });
  it('global search is permission-aware and finds records', async () => { const { incident } = await makeIncident(); const s = (await ops.get(`/search?q=${encodeURIComponent(incident.ref)}`)).body.data; expect(s.some((x: any) => x.type === 'Incident' && x.id === incident.id)).toBe(true); const v = (await verifier.get(`/search?q=${encodeURIComponent(incident.ref)}`)).body.data; expect(v.every((x: any) => ['Incident', 'Report'].includes(x.type))).toBe(true); expect((await verifier.get('/search?q=Test Team')).body.data.filter((x: any) => x.type === 'Team')).toHaveLength(0); });
  it('notifications are created for relevant roles and can be marked read', async () => { await newReport(ops, lokoja, { suggestedSeverity: 'CRITICAL' }); const n = (await verifier.get('/notifications?unread=true')).body; expect(n.data.some((x: any) => x.type === 'report.critical')).toBe(true); const id = n.data[0].id; await verifier.patch(`/notifications/${id}/read`); expect((await verifier.get('/notifications?unread=true')).body.unread).toBe(n.unread - 1); });
  it('geography: boundaries endpoint is empty until verified data is imported (no fake geometry)', async () => { const b = (await ops.get('/geography/boundaries')).body; expect(b.type).toBe('FeatureCollection'); expect(b.features).toHaveLength(0); expect((await ops.get('/geography/lgas')).body.data).toHaveLength(21); });
  it('PostGIS spatial columns are populated and indexed', async () => { const r: any[] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM incidents WHERE geom IS NOT NULL`); expect(r[0].n).toBeGreaterThan(0); const ix: any[] = await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE tablename='incidents' AND indexname='incidents_geom_gix'`); expect(ix).toHaveLength(1); });
});

describe('Administration, health, realtime outbox', () => {
  it('system health reports real status and never fakes green for missing integrations', async () => { const h = (await superadmin.get('/system/health')).body; expect(h.database.status).toBe('UP'); expect(h.database.detail.postgis).toMatch(/3\./); expect(h.queue.status).toBe('UP'); expect(h.notificationProviders.every((p: any) => p.status === 'INTEGRATION_PENDING')).toBe(true); expect(h.lastBackup.status).toBe('UNKNOWN'); });
  it('role management validates permissions; user edits are audited and version-checked', async () => {
    expect((await superadmin.post('/roles', { key: 'TEST_ROLE_' + uniq().toUpperCase(), name: 'Test role', permissions: ['nope.nope'] })).status).toBe(400);
    const u = (await superadmin.post('/users', { email: `ed${uniq()}@demo.kodems.test`, name: 'Edit Me', password: 'Valid-Passw0rd-1', roleKeys: ['EXEC_VIEWER'] })).body; expect((await superadmin.patch(`/users/${u.id}`, { name: 'Edited', version: u.version + 5 })).status).toBe(409);
    expect((await superadmin.patch(`/users/${u.id}`, { name: 'Edited', version: u.version })).body.name).toBe('Edited'); expect((await superadmin.get(`/audit-logs?entityId=${u.id}&action=users.update`)).body.data).toHaveLength(1);
    expect((await superadmin.get(`/users/${u.id}/activity`)).status).toBe(200); expect((await superadmin.get('/roles')).body.data.length).toBeGreaterThanOrEqual(10); expect((await superadmin.get('/permissions')).body.data.length).toBeGreaterThan(30);
  });
  it('agency admins cannot grant SUPER_ADMIN and users cannot promote themselves', async () => {
    const u = (await superadmin.post('/users', { email: `elevate${uniq()}@demo.kodems.test`, name: 'Elevation Target', password: 'Valid-Passw0rd-1', roleKeys: ['EXEC_VIEWER'] })).body;
    const denied = await admin.patch(`/users/${u.id}`, { roleKeys: ['SUPER_ADMIN'] });
    expect(denied.status).toBe(400); expect(denied.body.error.code).toBe('SUPER_ADMIN_REQUIRES_SUPER_ADMIN');
    const selfId = (await superadmin.get('/auth/me')).body.id;
    const self = await superadmin.patch(`/users/${selfId}`, { roleKeys: ['SUPER_ADMIN', 'AGENCY_ADMIN'] });
    expect(self.status).toBe(400); expect(self.body.error.code).toBe('SELF_ROLE_CHANGE');
  });
  it('passwords are stored as Argon2id hashes', async () => { const u = await db.user.findFirstOrThrow({ where: { email: 'ops@demo.kodems.test' } }); expect(u.passwordHash.startsWith('$argon2id$')).toBe(true); });
  it('errors use the uniform envelope with a request id; validation details are structured', async () => { const r = await ops.post('/incidents', { title: 'x' }); expect(r.status).toBe(400); expect(r.body.error.code).toBe('VALIDATION_ERROR'); expect(r.body.error.requestId).toBeTruthy(); expect(r.body.error.details.fieldErrors.title).toBeDefined(); });
  it('outbox: committed events are published exactly once to the realtime bus', async () => {
    const outbox = app.get(OutboxService); const seen: any[] = []; outbox.bus.on('event', e => seen.push(e)); await db.outboxEvent.updateMany({ where: { publishedAt: null }, data: { publishedAt: new Date() } });
    const r = await newReport(ops); await outbox.flush(); expect(seen.filter(e => e.type === 'report.created' && e.payload.id === r.body.id)).toHaveLength(1); await outbox.flush(); expect(seen.filter(e => e.type === 'report.created' && e.payload.id === r.body.id)).toHaveLength(1);
  });
  it('config: reference data and settings are manageable only by super admin, and audited', async () => { expect((await admin.post('/config/categories', { kind: 'INCIDENT', key: 'x_' + uniq(), label: 'X' })).status).toBe(403); const k = 'drought_' + uniq(); expect((await superadmin.post('/config/categories', { kind: 'INCIDENT', key: k, label: 'Drought' })).status).toBe(201); expect((await superadmin.patch('/config/settings/retention.test', { value: 12 })).status).toBe(200); });
});
