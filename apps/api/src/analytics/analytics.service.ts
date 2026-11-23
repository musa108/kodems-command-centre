import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from '../common/auth.types';

export interface Filters { from?: string; to?: string; lgaId?: string; category?: string; severity?: string; status?: string }
const csv = (s?: string) => s ? s.split(',').filter(Boolean) : undefined;

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  incWhere(u: AuthUser, f: Filters): any {
    const w: any = {};
    if (u.lgaScope !== null) w.lgaId = { in: u.lgaScope };
    if (f.lgaId) w.lgaId = u.lgaScope !== null && !u.lgaScope.includes(f.lgaId) ? { in: [] } : f.lgaId;
    if (f.category) w.category = { key: { in: csv(f.category) } };
    if (f.severity) w.severity = { in: csv(f.severity) };
    if (f.status) w.status = { in: csv(f.status) };
    if (f.from || f.to) w.createdAt = { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to + (f.to.length === 10 ? 'T23:59:59Z' : '')) : undefined };
    return w;
  }
  private scopeSql(u: AuthUser, col: string) { return u.lgaScope === null ? Prisma.sql`TRUE` : Prisma.sql`${Prisma.raw(col)} = ANY(${u.lgaScope}::uuid[])`; }

  async incidents(u: AuthUser, f: Filters) {
    const where = this.incWhere(u, f);
    const rows = await this.prisma.incident.findMany({ where, select: { id: true, severity: true, status: true, createdAt: true, lga: { select: { name: true } }, category: { select: { label: true } }, ward: true } });
    const tally = (k: (r: typeof rows[number]) => string) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { const x = k(r); m[x] = (m[x] ?? 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const sevByLga: Record<string, any> = {}; rows.forEach(r => { const o = (sevByLga[r.lga.name] ??= { name: r.lga.name, LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 }); o[r.severity]++; });
    const byDay: Record<string, number> = {}; rows.forEach(r => { const d = r.createdAt.toISOString().slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1; });
    return { total: rows.length, byLga: tally(r => r.lga.name), byWard: tally(r => r.ward ?? 'Unspecified'), byCategory: tally(r => r.category.label), bySeverity: tally(r => r.severity), byStatus: tally(r => r.status),
      severityByLga: Object.values(sevByLga), trend: Object.entries(byDay).sort().map(([date, count]) => ({ date, count })), generatedAt: new Date().toISOString(), filters: f };
  }

  async responsePerformance(u: AuthUser, f: Filters) {
    const from = f.from ? new Date(f.from) : new Date(0), to = f.to ? new Date(f.to + (f.to.length === 10 ? 'T23:59:59Z' : '')) : new Date(8.64e15 - 1);
    const sc = (c: string) => this.scopeSql(u, c);
    const [v]: any[] = await this.prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM ("verifiedAt" - "submittedAt")))/60 AS m, COUNT(*)::int AS n FROM incident_reports WHERE "verifiedAt" IS NOT NULL AND "submittedAt" BETWEEN ${from} AND ${to} AND ${sc('"lgaId"')}`;
    const [d]: any[] = await this.prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (first_dep - i."createdAt")))/60 AS m, COUNT(*)::int AS n FROM incidents i JOIN LATERAL (SELECT MIN("assignedAt") AS first_dep FROM deployments WHERE "incidentId" = i.id) x ON x.first_dep IS NOT NULL WHERE i."createdAt" BETWEEN ${from} AND ${to} AND ${sc('i."lgaId"')}`;
    const [r]: any[] = await this.prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (dep."arrivedAt" - dep."assignedAt")))/60 AS m, COUNT(*)::int AS n FROM deployments dep JOIN incidents i ON i.id = dep."incidentId" WHERE dep."arrivedAt" IS NOT NULL AND dep."assignedAt" BETWEEN ${from} AND ${to} AND ${sc('i."lgaId"')}`;
    const byStatus: any[] = await this.prisma.$queryRaw`SELECT dep.status::text AS name, COUNT(*)::int AS count FROM deployments dep JOIN incidents i ON i.id = dep."incidentId" WHERE dep."assignedAt" BETWEEN ${from} AND ${to} AND ${sc('i."lgaId"')} GROUP BY 1`;
    const round = (x: any) => x == null ? null : Math.round(Number(x) * 10) / 10;
    return { avgVerificationMinutes: round(v.m), verificationSample: v.n, avgDispatchMinutes: round(d.m), dispatchSample: d.n, avgResponseMinutes: round(r.m), responseSample: r.n, deploymentsByStatus: byStatus, generatedAt: new Date().toISOString(), note: 'Averages are null when there is no qualifying data in the period.' };
  }

  async affected(u: AuthUser, f: Filters) {
    const where: any = { ...(u.lgaScope !== null ? { lgaId: { in: u.lgaScope } } : {}), ...(f.lgaId ? { lgaId: f.lgaId } : {}) };
    if (f.from || f.to) where.createdAt = { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to + 'T23:59:59Z') : undefined };
    const hh = await this.prisma.affectedHousehold.findMany({ where, select: { size: true, displacement: true, damage: true, lga: { select: { name: true } } } });
    const sum = (a: typeof hh) => a.reduce((n, h) => n + h.size, 0);
    const byLga: Record<string, any> = {}; hh.forEach(h => { const o = (byLga[h.lga.name] ??= { name: h.lga.name, households: 0, persons: 0, displaced: 0 }); o.households++; o.persons += h.size; if (h.displacement === 'DISPLACED') o.displaced += h.size; });
    return { households: hh.length, registeredPersons: sum(hh), displacedPersons: sum(hh.filter(h => h.displacement === 'DISPLACED')), byLga: Object.values(byLga), byDamage: ['NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED'].map(d => ({ name: d, count: hh.filter(h => h.damage === d).length })), generatedAt: new Date().toISOString(), note: 'Counts reflect registered households only.' };
  }

  async relief(u: AuthUser, f: Filters) {
    const from = f.from ? new Date(f.from) : new Date(0), to = f.to ? new Date(f.to + 'T23:59:59Z') : new Date(8.64e15 - 1);
    const rows: any[] = await this.prisma.$queryRaw`SELECT ri.name, ri.unit, COALESCE(SUM(CASE WHEN t.delta > 0 AND t.type IN ('RECEIPT','DONATION','PROCUREMENT') THEN t.delta END),0)::int AS received, COALESCE(-SUM(CASE WHEN t.type = 'DISTRIBUTION' THEN t.delta END),0)::int AS distributed, COALESCE(-SUM(CASE WHEN t.type IN ('DAMAGED','EXPIRED') THEN t.delta END),0)::int AS lost
      FROM inventory_transactions t JOIN relief_items ri ON ri.id = t."itemId" JOIN warehouses w ON w.id = t."warehouseId" WHERE t."createdAt" BETWEEN ${from} AND ${to} AND ${this.scopeSql(u, 'w."lgaId"')} GROUP BY 1,2 ORDER BY 1`;
    const stock: any[] = await this.prisma.$queryRaw`SELECT w.name AS warehouse, ri.name AS item, SUM(t.delta)::int AS balance FROM inventory_transactions t JOIN warehouses w ON w.id = t."warehouseId" JOIN relief_items ri ON ri.id = t."itemId" WHERE ${this.scopeSql(u, 'w."lgaId"')} GROUP BY 1,2 ORDER BY 1,2`;
    return { items: rows, warehouseInventory: stock, generatedAt: new Date().toISOString() };
  }

  async shelters(u: AuthUser, _f: Filters) {
    const rows = await this.prisma.shelter.findMany({ where: u.lgaScope === null ? {} : { lgaId: { in: u.lgaScope } }, include: { lga: true, _count: { select: { registrations: { where: { checkOutAt: null } } } } }, orderBy: { name: 'asc' } });
    const data = rows.map(s => ({ name: s.name, lga: s.lga.name, status: s.status, capacity: s.capacity, occupancy: s._count.registrations, utilisation: Math.round((s._count.registrations / s.capacity) * 100) }));
    return { data, totals: { capacity: data.reduce((n, s) => n + s.capacity, 0), occupancy: data.reduce((n, s) => n + s.occupancy, 0) }, generatedAt: new Date().toISOString() };
  }

  async overview(u: AuthUser, f: Filters) {
    const iw = this.incWhere(u, f); const lw: any = u.lgaScope === null ? {} : { lgaId: { in: u.lgaScope } };
    const active = { in: ['OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY'] as any };
    const hhw: any = { ...lw, ...(f.lgaId ? { lgaId: f.lgaId } : {}) };
    const [total, activeN, critical, awaiting, activeDep, availTeams, hh, disp, sheltersActive, pendingAlloc] = await Promise.all([
      this.prisma.incident.count({ where: iw }), this.prisma.incident.count({ where: { ...iw, status: active } }), this.prisma.incident.count({ where: { ...iw, severity: 'CRITICAL', status: active } }),
      this.prisma.incidentReport.count({ where: { ...lw, ...(f.lgaId ? { lgaId: f.lgaId } : {}), status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.deployment.count({ where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'] }, incident: { ...lw } } }),
      this.prisma.responseTeam.count({ where: { ...lw, status: 'AVAILABLE' } }),
      this.prisma.affectedHousehold.aggregate({ where: hhw, _sum: { size: true } }), this.prisma.affectedHousehold.aggregate({ where: { ...hhw, displacement: 'DISPLACED' }, _sum: { size: true } }),
      this.prisma.shelter.count({ where: { ...lw, status: { in: ['ACTIVE', 'FULL'] } } }), this.prisma.reliefAllocation.count({ where: { status: 'PENDING_APPROVAL', incident: { ...lw } } })]);
    const perf = await this.responsePerformance(u, f);
    const openBySeverity = await this.prisma.incident.groupBy({ by: ['severity'], where: { ...iw, status: active }, _count: true });
    const byLga = (await this.incidents(u, f)).byLga;
    const resolved = await this.prisma.incident.count({ where: { ...iw, status: { in: ['RESOLVED', 'CLOSED'] } } });
    return { metrics: { totalIncidents: total, activeIncidents: activeN, criticalIncidents: critical, reportsAwaitingVerification: awaiting, activeDeployments: activeDep, availableTeams: availTeams, affectedPersons: hh._sum.size ?? 0, displacedPersons: disp._sum.size ?? 0, activeShelters: sheltersActive, pendingAllocations: pendingAlloc },
      performance: { avgVerificationMinutes: perf.avgVerificationMinutes, avgDispatchMinutes: perf.avgDispatchMinutes, avgResponseMinutes: perf.avgResponseMinutes, incidentsResolved: resolved, openBySeverity: openBySeverity.map(s => ({ severity: s.severity, count: s._count })) },
      byLga, generatedAt: new Date().toISOString(), filters: f };
  }
}
