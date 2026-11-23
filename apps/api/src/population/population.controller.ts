import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body, DomainError } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { assertInScope, scopeWhere } from '../common/scope';
import { occUpdate } from '../common/occ';
import { nextRef } from '../common/refs';

const dmg = z.enum(['NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED']);
const disp = z.enum(['NOT_DISPLACED', 'DISPLACED', 'RETURNED', 'RESETTLED']);
const band = z.enum(['0-4', '5-17', '18-59', '60+']);
// NOTE: no health fields exist in this model by design (no defined lawful operational need).
const hhS = z.object({ incidentId: z.string().uuid(), headName: z.string().trim().min(2).max(120), lgaId: z.string().uuid().optional(), ward: z.string().max(100).optional(), community: z.string().max(100).optional(),
  lat: z.number().optional(), lng: z.number().optional(), size: z.number().int().min(1).max(100), damage: dmg.default('NONE'), displacement: disp.default('NOT_DISPLACED'),
  immediateNeeds: z.string().max(500).optional(), needs: z.array(z.string().max(80)).default([]), source: z.string().max(60).default('FIELD_REGISTRATION'), confirmNotDuplicate: z.boolean().optional() });
const hhPatch = z.object({ headName: z.string().trim().min(2).max(120).optional(), size: z.number().int().min(1).max(100).optional(), damage: dmg.optional(), displacement: disp.optional(), immediateNeeds: z.string().max(500).nullable().optional(), ward: z.string().optional(), community: z.string().optional(), version: z.number().int().optional() });
const personS = z.object({ householdId: z.string().uuid(), name: z.string().trim().max(120).optional(), ageBand: band.optional(), sex: z.enum(['F', 'M']).optional(), relationship: z.string().max(40).optional(), displacement: disp.default('NOT_DISPLACED'), assistanceNeeds: z.string().max(300).optional() });

const mask = (s?: string | null) => s ? s.split(' ').map(p => p[0] + '•'.repeat(Math.max(1, p.length - 1))).join(' ') : s;

@Controller()
export class PopulationController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async hh(u: AuthUser, id: string) {
    const h = await this.prisma.affectedHousehold.findUnique({ where: { id }, include: { lga: true, incident: { select: { id: true, ref: true, title: true } }, persons: true, needs: true, beneficiary: { select: { ref: true } } } });
    if (!h) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Household not found' });
    assertInScope(u, h.lgaId); return h;
  }

  @Get('households') @Perm('population.read')
  async list(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const q = pageQuery.parse(raw); const pii = u.permissions.has('population.pii');
    const where: any = { ...scopeWhere(u) };
    if (raw.incidentId) where.incidentId = raw.incidentId; if (raw.lgaId) where.lgaId = raw.lgaId;
    if (raw.displacement) where.displacement = raw.displacement; if (raw.damage) where.damage = raw.damage;
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, ...(pii ? [{ headName: { contains: q.q, mode: 'insensitive' } }] : [])];
    const [rows, total] = await Promise.all([
      this.prisma.affectedHousehold.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { lga: true, incident: { select: { ref: true } } } }),
      this.prisma.affectedHousehold.count({ where })]);
    if (pii && rows.length) await this.audit.log(u, { action: 'population.view_pii_list', entityType: 'household', after: { count: rows.length } });
    return paged(rows.map(h => ({ id: h.id, ref: h.ref, headName: pii ? h.headName : mask(h.headName), size: h.size, damage: h.damage, displacement: h.displacement, lga: h.lga.name, community: h.community, incident: h.incident.ref, isDemo: h.isDemo, version: h.version, createdAt: h.createdAt })), total, q.page, q.pageSize);
  }

  @Post('households') @Perm('population.manage')
  async create(@CurrentUser() u: AuthUser, @Body(body(hhS)) b: z.infer<typeof hhS>) {
    const inc = await this.prisma.incident.findUnique({ where: { id: b.incidentId } });
    if (!inc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
    const lgaId = b.lgaId ?? inc.lgaId; assertInScope(u, lgaId);
    const dups = await this.prisma.affectedHousehold.findMany({ where: { incidentId: b.incidentId, headName: { equals: b.headName, mode: 'insensitive' }, lgaId }, select: { id: true, ref: true } });
    if (dups.length && !b.confirmNotDuplicate) throw new DomainError('POSSIBLE_DUPLICATE', `Possible duplicate of ${dups.map(d => d.ref).join(', ')}. Resubmit with confirmNotDuplicate to proceed.`, 409);
    return this.prisma.$transaction(async tx => {
      const { needs, confirmNotDuplicate: _c, lgaId: _l, ...rest } = b;
      const h = await tx.affectedHousehold.create({ data: { ...rest, lgaId, ref: await nextRef(tx, 'HH'), isDemo: inc.isDemo, needs: { create: needs.map(need => ({ need })) } } });
      await tx.damageAssessment.create({ data: { incidentId: inc.id, householdId: h.id, level: b.damage, assessedById: u.id } });
      await this.audit.log(u, { action: 'population.household_create', entityType: 'household', entityId: h.id, after: { ref: h.ref, size: h.size, damage: h.damage } }, tx);
      return h;
    });
  }

  @Get('households/:id') @Perm('population.read')
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const h = await this.hh(u, id); const pii = u.permissions.has('population.pii');
    if (pii) await this.audit.log(u, { action: 'population.view_pii', entityType: 'household', entityId: id });
    return { ...h, headName: pii ? h.headName : mask(h.headName), persons: h.persons.map(p => ({ ...p, name: pii ? p.name : mask(p.name) })) };
  }

  @Patch('households/:id') @Perm('population.manage')
  async patch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(hhPatch)) b: z.infer<typeof hhPatch>) {
    const cur = await this.hh(u, id); const { version, ...rest } = b;
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'affectedHousehold', id, version, rest);
      if (b.damage && b.damage !== cur.damage) await tx.damageAssessment.create({ data: { incidentId: cur.incidentId, householdId: id, level: b.damage, assessedById: u.id } });
      await this.audit.log(u, { action: b.displacement && b.displacement !== cur.displacement ? `population.${b.displacement.toLowerCase()}` : 'population.household_update', entityType: 'household', entityId: id,
        before: { damage: cur.damage, displacement: cur.displacement, size: cur.size }, after: rest }, tx);
      return upd;
    });
  }

  @Get('persons') @Perm('population.read')
  async persons(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const q = pageQuery.parse(raw); const pii = u.permissions.has('population.pii');
    const where: any = { household: { ...scopeWhere(u), ...(raw.incidentId ? { incidentId: raw.incidentId } : {}) } };
    if (raw.householdId) where.householdId = raw.householdId;
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, ...(pii ? [{ name: { contains: q.q, mode: 'insensitive' } }] : [])];
    const [rows, total] = await Promise.all([this.prisma.affectedPerson.findMany({ where, orderBy: { registeredAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { household: { select: { ref: true } } } }), this.prisma.affectedPerson.count({ where })]);
    if (pii && rows.length) await this.audit.log(u, { action: 'population.view_pii_list', entityType: 'person', after: { count: rows.length } });
    return paged(rows.map(p => ({ id: p.id, ref: p.ref, household: p.household.ref, name: pii ? p.name : mask(p.name), ageBand: p.ageBand, displacement: p.displacement })), total, q.page, q.pageSize);
  }
  @Post('persons') @Perm('population.manage')
  async addPerson(@CurrentUser() u: AuthUser, @Body(body(personS)) b: z.infer<typeof personS>) {
    const h = await this.hh(u, b.householdId);
    if (h.persons.length >= h.size) throw new BadRequestException({ code: 'HOUSEHOLD_FULL', message: `Household size is ${h.size}; update the size first` });
    return this.prisma.$transaction(async tx => {
      const p = await tx.affectedPerson.create({ data: { ...b, ref: await nextRef(tx, 'PER') } });
      await this.audit.log(u, { action: 'population.person_create', entityType: 'person', entityId: p.id, after: { ref: p.ref, household: h.ref } }, tx); return { id: p.id, ref: p.ref };
    });
  }
  @Patch('persons/:id') @Perm('population.manage')
  async patchPerson(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(personS.partial().omit({ householdId: true }))) b: any) {
    const p = await this.prisma.affectedPerson.findUnique({ where: { id }, include: { household: true } }); if (!p) throw new NotFoundException(); assertInScope(u, p.household.lgaId);
    const upd = await this.prisma.affectedPerson.update({ where: { id }, data: b });
    await this.audit.log(u, { action: 'population.person_update', entityType: 'person', entityId: id, before: { displacement: p.displacement }, after: b }); return { id: upd.id };
  }
}
