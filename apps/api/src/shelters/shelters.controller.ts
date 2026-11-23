import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body, DomainError } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { assertInScope, scopeWhere } from '../common/scope';
import { shelterStatusFor } from '../common/state';
import { nextRef } from '../common/refs';
import { occUpdate } from '../common/occ';

const shS = z.object({ name: z.string().trim().min(3).max(120), lgaId: z.string().uuid(), ward: z.string().max(100).optional(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
  capacity: z.number().int().min(1).max(100000), facilities: z.array(z.string().max(60)).default([]), accessibility: z.string().max(300).optional(), contactPerson: z.string().max(120).optional(), contactPhone: z.string().max(30).optional() });
const patchS = z.object({ name: z.string().trim().min(3).max(120).optional(), capacity: z.number().int().min(1).max(100000).optional(), facilities: z.array(z.string().max(60)).optional(), accessibility: z.string().max(300).nullable().optional(),
  contactPerson: z.string().max(120).nullable().optional(), contactPhone: z.string().max(30).nullable().optional(), shortages: z.string().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'CLOSED']).optional(), reason: z.string().max(300).optional(), version: z.number().int().optional() });
const inS = z.object({ name: z.string().trim().min(2).max(120), ageBand: z.enum(['0-4', '5-17', '18-59', '60+']).optional(), personId: z.string().uuid().optional(), incidentId: z.string().uuid().optional() });

@Controller('shelters')
export class SheltersController {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService) {}

  private async occ(tx: any, id: string): Promise<number> { return tx.shelterRegistration.count({ where: { shelterId: id, checkOutAt: null } }); }
  private async load(u: AuthUser, id: string) { const s = await this.prisma.shelter.findUnique({ where: { id } }); if (!s) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Shelter not found' }); assertInScope(u, s.lgaId); return s; }

  @Get() @Perm('shelters.read')
  async list(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const q = pageQuery.parse(raw);
    const where: any = { ...scopeWhere(u) }; if (raw.status) where.status = { in: String(raw.status).split(',') }; if (raw.lgaId) where.lgaId = raw.lgaId;
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([this.prisma.shelter.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { lga: true, _count: { select: { registrations: { where: { checkOutAt: null } } } } } }), this.prisma.shelter.count({ where })]);
    return paged(rows.map(s => ({ id: s.id, code: s.code, name: s.name, lga: s.lga.name, status: s.status, capacity: s.capacity, occupancy: s._count.registrations, available: Math.max(0, s.capacity - s._count.registrations), shortages: s.shortages, isDemo: s.isDemo, version: s.version })), total, q.page, q.pageSize);
  }
  @Post() @Perm('shelters.manage')
  async create(@CurrentUser() u: AuthUser, @Body(body(shS)) b: z.infer<typeof shS>) {
    assertInScope(u, b.lgaId);
    return this.prisma.$transaction(async tx => {
      const s = await tx.shelter.create({ data: { ...b, code: (await nextRef(tx, 'SHL')).replace('KOS-', '') } });
      await tx.shelterOccupancyHistory.create({ data: { shelterId: s.id, occupancy: 0, capacity: s.capacity, reason: 'Registered' } });
      await this.audit.log(u, { action: 'shelters.create', entityType: 'shelter', entityId: s.id, after: { name: s.name, capacity: s.capacity } }, tx); return s;
    });
  }
  @Get(':id') @Perm('shelters.read')
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.load(u, id); const pii = u.permissions.has('population.pii');
    const [lga, regs, hist, occ] = await Promise.all([this.prisma.lga.findUnique({ where: { id: s.lgaId } }),
      this.prisma.shelterRegistration.findMany({ where: { shelterId: id }, orderBy: { checkInAt: 'desc' }, take: 100 }),
      this.prisma.shelterOccupancyHistory.findMany({ where: { shelterId: id }, orderBy: { at: 'desc' }, take: 100 }), this.occ(this.prisma, id)]);
    return { ...s, lga, occupancy: occ, available: Math.max(0, s.capacity - occ), registrations: regs.map(r => ({ id: r.id, name: pii ? r.name : r.name.split(' ').map(p => p[0] + '•••').join(' '), ageBand: r.ageBand, checkInAt: r.checkInAt, checkOutAt: r.checkOutAt })), history: hist };
  }
  @Get(':id/occupancy') @Perm('shelters.read')
  async occupancy(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.load(u, id); const occ = await this.occ(this.prisma, id);
    return { capacity: s.capacity, occupancy: occ, available: Math.max(0, s.capacity - occ), status: s.status, history: await this.prisma.shelterOccupancyHistory.findMany({ where: { shelterId: id }, orderBy: { at: 'asc' }, take: 500 }) };
  }
  @Patch(':id') @Perm('shelters.manage')
  async patch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchS)) b: z.infer<typeof patchS>) {
    const cur = await this.load(u, id); const { version, reason, ...rest } = b;
    if (rest.status && rest.status !== cur.status && !reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to change status' });
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM shelters WHERE id = ${id}::uuid FOR UPDATE`;
      const occ = await this.occ(tx, id);
      if (rest.capacity !== undefined && rest.capacity < occ) throw new DomainError('CAPACITY_BELOW_OCCUPANCY', `Capacity cannot be below current occupancy (${occ})`);
      if (rest.status === 'CLOSED' && occ > 0) throw new DomainError('SHELTER_OCCUPIED', `${occ} evacuee(s) are still checked in`);
      const cap = rest.capacity ?? cur.capacity; const base = rest.status ?? (cur.status === 'FULL' ? 'ACTIVE' : cur.status);
      const status = shelterStatusFor(occ, cap, base);
      const upd = await occUpdate(tx, 'shelter', id, version, { ...rest, status });
      if (rest.capacity !== undefined) await tx.shelterOccupancyHistory.create({ data: { shelterId: id, occupancy: occ, capacity: cap, reason: `Capacity ${cur.capacity} → ${cap}` } });
      await this.audit.log(u, { action: 'shelters.update', entityType: 'shelter', entityId: id, before: { status: cur.status, capacity: cur.capacity }, after: { ...rest, status }, reason }, tx);
      if (rest.shortages) await this.notify.toPermission(tx, 'shelters.read', { type: 'shelter.shortage', title: `Shortage at ${cur.name}`, body: rest.shortages, entityType: 'shelter', entityId: id, lgaId: cur.lgaId }, u.id);
      await this.outbox.emit(tx, 'shelter.occupancy_updated', { id, occupancy: occ, status }, cur.lgaId);
      return upd;
    });
  }
  @Post(':id/check-in') @Perm('shelters.manage')
  async checkIn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(inS)) b: z.infer<typeof inS>) {
    const s = await this.load(u, id);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM shelters WHERE id = ${id}::uuid FOR UPDATE`; // serialises concurrent check-ins: capacity can never be exceeded
      const cur = await tx.shelter.findUniqueOrThrow({ where: { id } });
      if (cur.status !== 'ACTIVE' && cur.status !== 'FULL') throw new DomainError('SHELTER_UNAVAILABLE', `Shelter is ${cur.status}`);
      const occ = await this.occ(tx, id);
      if (occ >= cur.capacity) throw new DomainError('SHELTER_FULL', `Shelter is at capacity (${cur.capacity})`, 409);
      if (b.personId && await tx.shelterRegistration.findFirst({ where: { personId: b.personId, checkOutAt: null } })) throw new DomainError('ALREADY_CHECKED_IN', 'Person is already checked in to a shelter', 409);
      const reg = await tx.shelterRegistration.create({ data: { shelterId: id, name: b.name, ageBand: b.ageBand, personId: b.personId, incidentId: b.incidentId, checkedInById: u.id } });
      const status = shelterStatusFor(occ + 1, cur.capacity, cur.status === 'FULL' ? 'ACTIVE' : cur.status);
      await tx.shelter.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await tx.shelterOccupancyHistory.create({ data: { shelterId: id, occupancy: occ + 1, capacity: cur.capacity, reason: 'Check-in' } });
      await this.audit.log(u, { action: 'shelters.check_in', entityType: 'shelter', entityId: id, after: { registrationId: reg.id, occupancy: occ + 1 } }, tx);
      if (occ + 1 >= cur.capacity * 0.9) await this.notify.toPermission(tx, 'shelters.read', { type: 'shelter.capacity_warning', title: `${s.name} at ${occ + 1}/${cur.capacity}`, body: 'Capacity warning', entityType: 'shelter', entityId: id, lgaId: s.lgaId }, u.id);
      await this.outbox.emit(tx, 'shelter.occupancy_updated', { id, occupancy: occ + 1, status }, s.lgaId);
      return { registrationId: reg.id, occupancy: occ + 1, status };
    });
  }
  @Post(':id/check-out') @Perm('shelters.manage')
  async checkOut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ registrationId: z.string().uuid() }))) b: { registrationId: string }) {
    const s = await this.load(u, id);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM shelters WHERE id = ${id}::uuid FOR UPDATE`;
      const reg = await tx.shelterRegistration.findFirst({ where: { id: b.registrationId, shelterId: id } });
      if (!reg) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registration not found' });
      if (reg.checkOutAt) throw new DomainError('ALREADY_CHECKED_OUT', 'Already checked out', 409);
      await tx.shelterRegistration.update({ where: { id: reg.id }, data: { checkOutAt: new Date() } });
      const occ = await this.occ(tx, id); const cur = await tx.shelter.findUniqueOrThrow({ where: { id } });
      const status = shelterStatusFor(occ, cur.capacity, cur.status === 'FULL' ? 'ACTIVE' : cur.status);
      await tx.shelter.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await tx.shelterOccupancyHistory.create({ data: { shelterId: id, occupancy: occ, capacity: cur.capacity, reason: 'Check-out' } });
      await this.audit.log(u, { action: 'shelters.check_out', entityType: 'shelter', entityId: id, after: { registrationId: reg.id, occupancy: occ } }, tx);
      await this.outbox.emit(tx, 'shelter.occupancy_updated', { id, occupancy: occ, status }, s.lgaId);
      return { occupancy: occ, status };
    });
  }
}
