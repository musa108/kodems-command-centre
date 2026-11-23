import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body, DomainError } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { assertInScope, scopeWhere } from '../common/scope';
import { occUpdate } from '../common/occ';
import { nextRef } from '../common/refs';

const teamS = z.object({ name: z.string().trim().min(3).max(120), categoryId: z.string().uuid(), agency: z.string().trim().min(2).max(120), lgaId: z.string().uuid(),
  baseLat: z.number().min(-90).max(90).optional(), baseLng: z.number().min(-180).max(180).optional(), contact: z.string().max(60).optional(),
  capabilities: z.array(z.string().min(2).max(60)).default([]), equipment: z.array(z.object({ name: z.string().min(2), quantity: z.number().int().min(1).default(1), condition: z.string().optional() })).default([]),
  vehicles: z.array(z.object({ plate: z.string().min(3).max(20), type: z.string().min(2) })).default([]) });
const patchS = z.object({ name: z.string().trim().min(3).max(120).optional(), agency: z.string().max(120).optional(), contact: z.string().max(60).nullable().optional(), baseLat: z.number().optional(), baseLng: z.number().optional(),
  capabilities: z.array(z.string().min(2).max(60)).optional(), version: z.number().int().optional() });
const memberS = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().max(30).optional(), role: z.string().max(60).optional(), isLeader: z.boolean().default(false) });
const availS = z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE']), reason: z.string().max(300).optional(), version: z.number().int().optional() });

@Controller('teams')
export class TeamsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService) {}

  @Get() @Perm('teams.read')
  async list(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const q = pageQuery.parse(raw);
    const where: any = { ...scopeWhere(u) };
    if (raw.status) where.status = { in: String(raw.status).split(',') };
    if (raw.categoryKey) where.category = { key: raw.categoryKey };
    if (raw.lgaId) where.lgaId = raw.lgaId;
    if (raw.capability) where.capabilities = { some: { name: { contains: String(raw.capability), mode: 'insensitive' } } };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      this.prisma.responseTeam.findMany({ where, orderBy: [{ status: 'asc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true, lga: true, capabilities: true, _count: { select: { members: true } } } }),
      this.prisma.responseTeam.count({ where })]);
    return paged(rows.map(t => ({ id: t.id, code: t.code, name: t.name, category: t.category.label, categoryKey: t.category.key, agency: t.agency, lga: t.lga.name, lgaId: t.lgaId, status: t.status, capabilities: t.capabilities.map(c => c.name), memberCount: t._count.members, isDemo: t.isDemo, version: t.version })), total, q.page, q.pageSize);
  }

  @Post() @Perm('teams.manage')
  async create(@CurrentUser() u: AuthUser, @Body(body(teamS)) b: z.infer<typeof teamS>) {
    assertInScope(u, b.lgaId);
    return this.prisma.$transaction(async tx => {
      const code = (await nextRef(tx, 'TM')).replace('KOS-', '');
      const t = await tx.responseTeam.create({ data: { code, name: b.name, categoryId: b.categoryId, agency: b.agency, lgaId: b.lgaId, baseLat: b.baseLat, baseLng: b.baseLng, contact: b.contact,
        capabilities: { create: [...new Set(b.capabilities)].map(name => ({ name })) }, equipment: { create: b.equipment }, vehicles: { create: b.vehicles } } });
      await this.audit.log(u, { action: 'teams.create', entityType: 'team', entityId: t.id, after: { name: b.name, lgaId: b.lgaId } }, tx);
      return t;
    });
  }

  @Get(':id') @Perm('teams.read')
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.responseTeam.findUnique({ where: { id }, include: { category: true, lga: true, members: { where: { active: true }, orderBy: [{ isLeader: 'desc' }, { name: 'asc' }] }, capabilities: true, equipment: true, vehicles: true,
      deployments: { orderBy: { assignedAt: 'desc' }, take: 25, include: { incident: { select: { id: true, ref: true, title: true } } } } } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team not found' });
    assertInScope(u, t.lgaId);
    const current = t.deployments.find(d => ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'].includes(d.status)) ?? null;
    return { ...t, currentDeployment: current };
  }

  @Patch(':id') @Perm('teams.manage')
  async patch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchS)) b: z.infer<typeof patchS>) {
    const cur = await this.prisma.responseTeam.findUnique({ where: { id }, include: { capabilities: true } });
    if (!cur) throw new NotFoundException(); assertInScope(u, cur.lgaId);
    return this.prisma.$transaction(async tx => {
      const { capabilities, version, ...rest } = b;
      if (capabilities) { await tx.teamCapability.deleteMany({ where: { teamId: id } }); await tx.teamCapability.createMany({ data: [...new Set(capabilities)].map(name => ({ teamId: id, name })) }); }
      const upd = await occUpdate(tx, 'responseTeam', id, version, rest);
      await this.audit.log(u, { action: 'teams.update', entityType: 'team', entityId: id, before: { name: cur.name, capabilities: cur.capabilities.map(c => c.name) }, after: b }, tx);
      return upd;
    });
  }

  @Post(':id/members') @Perm('teams.manage')
  async addMember(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(memberS)) b: z.infer<typeof memberS>) {
    const t = await this.prisma.responseTeam.findUnique({ where: { id } }); if (!t) throw new NotFoundException(); assertInScope(u, t.lgaId);
    return this.prisma.$transaction(async tx => {
      if (b.isLeader) await tx.teamMember.updateMany({ where: { teamId: id, isLeader: true }, data: { isLeader: false } }); // exactly one leader
      const m = await tx.teamMember.create({ data: { teamId: id, ...b } });
      await this.audit.log(u, { action: 'teams.add_member', entityType: 'team', entityId: id, after: { name: b.name, isLeader: b.isLeader } }, tx);
      return m;
    });
  }

  @Patch(':id/availability') @Perm('teams.manage')
  async availability(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(availS)) b: z.infer<typeof availS>) {
    const t = await this.prisma.responseTeam.findUnique({ where: { id } }); if (!t) throw new NotFoundException(); assertInScope(u, t.lgaId);
    if (t.status === 'DEPLOYED') throw new DomainError('TEAM_DEPLOYED', 'A deployed team’s status is controlled by its deployment. Complete or reassign the deployment first.');
    if (b.status !== 'AVAILABLE' && !b.reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required' });
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'responseTeam', id, b.version, { status: b.status });
      await this.audit.log(u, { action: 'teams.availability', entityType: 'team', entityId: id, before: { status: t.status }, after: { status: b.status }, reason: b.reason }, tx);
      await this.outbox.emit(tx, 'team.updated', { id, status: b.status }, t.lgaId);
      return upd;
    });
  }
}
