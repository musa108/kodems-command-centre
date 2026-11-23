import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Patch, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import Redis from 'ioredis';
import { existsSync, accessSync, constants, mkdirSync } from 'fs';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { StorageService } from '../common/storage.service';
import { CurrentUser, Perm, Public } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { scopeWhere } from '../common/scope';

const catS = z.object({ kind: z.enum(['INCIDENT', 'TEAM', 'SHELTER', 'RELIEF']), key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), label: z.string().trim().min(2).max(80) });
const lgaS = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(12) });
const wardS = z.object({ lgaId: z.string().uuid(), name: z.string().trim().min(2).max(100) });
const commS = z.object({ lgaId: z.string().uuid(), wardId: z.string().uuid().optional(), name: z.string().trim().min(2).max(100), lat: z.number().optional(), lng: z.number().optional() });
const settingS = z.object({ value: z.any() });

@Controller()
export class AdminController {
  constructor(private prisma: PrismaService, private audit: AuditService, private storage: StorageService) {}

  // ── Reference data ──
  @Get('config/categories') @Perm('dashboard.read') async categories(@Query('kind') kind?: string) {
    return { data: await this.prisma.refCategory.findMany({ where: { ...(kind ? { kind: kind as any } : {}), active: true }, orderBy: { label: 'asc' } }) };
  }
  @Post('config/categories') @Perm('config.manage')
  async newCat(@CurrentUser() u: AuthUser, @Body(body(catS)) b: z.infer<typeof catS>) { const c = await this.prisma.refCategory.create({ data: b }); await this.audit.log(u, { action: 'config.category_create', entityType: 'category', entityId: c.id, after: b }); return c; }
  @Patch('config/categories/:id') @Perm('config.manage')
  async patchCat(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ label: z.string().min(2).optional(), active: z.boolean().optional() }))) b: any) {
    const before = await this.prisma.refCategory.findUniqueOrThrow({ where: { id } }); const c = await this.prisma.refCategory.update({ where: { id }, data: b });
    await this.audit.log(u, { action: 'config.category_update', entityType: 'category', entityId: id, before, after: b }); return c;
  }
  @Post('config/lgas') @Perm('config.manage')
  async newLga(@CurrentUser() u: AuthUser, @Body(body(lgaS)) b: z.infer<typeof lgaS>) { const l = await this.prisma.lga.create({ data: { ...b, source: `manual entry by ${u.email}` } }); await this.audit.log(u, { action: 'config.lga_create', entityType: 'lga', entityId: l.id, after: b }); return l; }
  @Post('config/wards') @Perm('config.manage')
  async newWard(@CurrentUser() u: AuthUser, @Body(body(wardS)) b: z.infer<typeof wardS>) { const w = await this.prisma.ward.create({ data: b }); await this.audit.log(u, { action: 'config.ward_create', entityType: 'ward', entityId: w.id, after: b }); return w; }
  @Post('config/communities') @Perm('config.manage')
  async newComm(@CurrentUser() u: AuthUser, @Body(body(commS)) b: z.infer<typeof commS>) { const c = await this.prisma.community.create({ data: b }); await this.audit.log(u, { action: 'config.community_create', entityType: 'community', entityId: c.id, after: b }); return c; }
  @Get('config/settings') @Perm('config.manage') async settings() { return { data: await this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }) }; }
  @Patch('config/settings/:key') @Perm('config.manage')
  async setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body(body(settingS)) b: { value: any }) {
    if (!/^[a-z0-9_.]{2,60}$/.test(key)) throw new BadRequestException({ code: 'BAD_KEY', message: 'Invalid key' });
    const before = await this.prisma.systemSetting.findUnique({ where: { key } });
    const s = await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: b.value }, update: { value: b.value } });
    await this.audit.log(u, { action: 'config.setting_update', entityType: 'setting', entityId: key, before: before?.value, after: b.value }); return s;
  }
  @Get('config/integrations') @Perm('users.manage') async integrations() { return { data: await this.prisma.integrationConfig.findMany({ select: { key: true, enabled: true, status: true, updatedAt: true } }) }; }

  // ── Media download: key must belong to a report/incident the caller may see ──
  @Get('media/:key') @Perm('dashboard.read')
  async media(@CurrentUser() u: AuthUser, @Param('key') key: string, @Res({ passthrough: true }) res: Response) {
    const rm = await this.prisma.reportMedia.findFirst({ where: { storageKey: key }, include: { report: { select: { lgaId: true } } } });
    const im = rm ? null : await this.prisma.incidentMedia.findFirst({ where: { storageKey: key }, include: { incident: { select: { lgaId: true } } } });
    const m = rm ?? im; if (!m) throw new NotFoundException();
    const lga = rm ? rm.report.lgaId : im!.incident.lgaId;
    if (!u.permissions.has(rm ? 'reports.read' : 'incidents.read')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No access' });
    if (u.lgaScope !== null && !u.lgaScope.includes(lga)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'Outside scope' });
    const stream = this.storage.stream(key); if (!stream) throw new NotFoundException();
    res.setHeader('Content-Type', m.mime); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', 'attachment'); return new StreamableFile(stream);
  }

  // ── Staff directory (id + name only) for assignment pickers ──
  @Get('directory/users') @Perm('dashboard.read')
  async directory(@CurrentUser() u: AuthUser, @Query('permission') permission?: string) {
    const allowed = ['incidents.verify', 'incidents.assign', 'deployments.assign', 'relief.allocations.approve', 'deployments.update'];
    if (!permission || !allowed.includes(permission)) throw new BadRequestException({ code: 'BAD_PERMISSION', message: 'Unsupported permission filter' });
    if (!['reports.assign', 'incidents.assign', 'deployments.assign', 'users.manage'].some(p => u.permissions.has(p))) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No access' });
    const rows = await this.prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 });
    return { data: rows };
  }

  // ── Audit ──
  @Get('audit-logs') @Perm('audit.read')
  async auditLogs(@Query() raw: any) {
    const q = pageQuery.parse(raw); const where: any = {};
    if (raw.entityType) where.entityType = raw.entityType; if (raw.entityId) where.entityId = raw.entityId; if (raw.userId) where.userId = raw.userId;
    if (raw.action) where.action = { startsWith: String(raw.action) };
    if (raw.from || raw.to) where.at = { gte: raw.from ? new Date(raw.from) : undefined, lte: raw.to ? new Date(raw.to) : undefined };
    if (q.q) where.OR = [{ action: { contains: q.q, mode: 'insensitive' } }, { entityId: { contains: q.q } }];
    const [rows, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), this.prisma.auditLog.count({ where })]);
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map(r => r.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true, email: true } });
    const nm = Object.fromEntries(users.map(x => [x.id, x.name]));
    return paged(rows.map(r => ({ ...r, id: String(r.id), userName: r.userId ? nm[r.userId] : null })), total, q.page, q.pageSize);
  }

  // ── Health: real checks, never fake-green ──
  @Public() @Get('health') async liveness() { return { status: 'ok', time: new Date().toISOString() }; }

  @Get('system/health') @Perm('system.health')
  async health() {
    const t = async (fn: () => Promise<any>) => { const s = Date.now(); try { const d = await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]); return { status: 'UP', latencyMs: Date.now() - s, detail: d }; } catch (e: any) { return { status: 'DOWN', error: e.message }; } };
    const db = await t(async () => { const r: any[] = await this.prisma.$queryRaw`SELECT postgis_version() AS v`; return { postgis: r[0].v }; });
    const queue = await t(async () => { const rd = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null }); try { await rd.connect(); return { ping: await rd.ping() }; } finally { rd.disconnect(); } });
    const storage = await t(async () => { mkdirSync(this.storage.dir, { recursive: true }); accessSync(this.storage.dir, constants.W_OK); return { backend: this.storage.backend, writable: existsSync(this.storage.dir) }; });
    const outbox = await t(async () => ({ unpublished: await this.prisma.outboxEvent.count({ where: { publishedAt: null } }) }));
    const integ = await this.prisma.integrationConfig.findMany();
    const providers = ['sms', 'email', 'push'].map(k => { const c = integ.find(i => i.key === k); return { key: k, status: c?.enabled && c.status === 'CONFIGURED' ? 'CONFIGURED' : 'INTEGRATION_PENDING' }; });
    const errs = await this.prisma.auditLog.count({ where: { action: 'auth.login_failed', at: { gte: new Date(Date.now() - 864e5) } } });
    return { api: { status: 'UP' }, database: db, queue, storage, outbox, notificationProviders: providers, lastBackup: { status: 'UNKNOWN', note: 'Backup integration pending: no backup job reports to this system yet (see docs/DEPLOYMENT.md).' },
      recentErrors: { failedLoginsLast24h: errs, note: 'Application error aggregation is not integrated; use structured logs / external monitoring.' }, checkedAt: new Date().toISOString() };
  }

  // ── Global search (permission- and scope-aware, no PII in suggestions) ──
  @Get('search') @Perm('search.global')
  async search(@CurrentUser() u: AuthUser, @Query('q') qs?: string) {
    const q = (qs ?? '').trim(); if (q.length < 2) return { data: [] };
    const has = (p: string) => u.permissions.has(p); const ins = { contains: q, mode: 'insensitive' as const };
    const out: any[] = [];
    const jobs: Promise<void>[] = [];
    if (has('incidents.read')) jobs.push(this.prisma.incident.findMany({ where: { ...scopeWhere(u), OR: [{ ref: ins }, { title: ins }] }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Incident', id: i.id, label: `${i.ref} — ${i.title}`, href: `/incidents/${i.id}` }))));
    if (has('reports.read')) jobs.push(this.prisma.incidentReport.findMany({ where: { ...scopeWhere(u), ref: ins }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Report', id: i.id, label: i.ref, href: `/reports/${i.id}` }))));
    if (has('teams.read')) jobs.push(this.prisma.responseTeam.findMany({ where: { ...scopeWhere(u), OR: [{ name: ins }, { code: ins }] }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Team', id: i.id, label: i.name, href: `/teams/${i.id}` }))));
    if (has('deployments.read')) jobs.push(this.prisma.deployment.findMany({ where: { incident: { ...scopeWhere(u) }, ref: ins }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Deployment', id: i.id, label: i.ref, href: `/deployments/${i.id}` }))));
    if (has('shelters.read')) jobs.push(this.prisma.shelter.findMany({ where: { ...scopeWhere(u), OR: [{ name: ins }, { code: ins }] }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Shelter', id: i.id, label: i.name, href: `/shelters/${i.id}` }))));
    if (has('relief.inventory.read')) jobs.push(this.prisma.warehouse.findMany({ where: { ...scopeWhere(u), OR: [{ name: ins }, { code: ins }] }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Warehouse', id: i.id, label: i.name, href: `/relief` }))));
    if (has('population.read')) jobs.push(this.prisma.affectedHousehold.findMany({ where: { ...scopeWhere(u), ref: ins }, take: 5 }).then(r => r.forEach(i => out.push({ type: 'Household', id: i.id, label: i.ref, href: `/households/${i.id}` }))));
    await Promise.all(jobs); return { data: out };
  }
}
