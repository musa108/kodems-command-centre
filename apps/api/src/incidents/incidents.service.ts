import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { AuthUser } from '../common/auth.types';
import { DomainError } from '../common/errors';
import { assertInScope, scopeWhere } from '../common/scope';
import { canTransition, INCIDENT_TRANSITIONS, ACTIVE_DEPLOYMENT } from '../common/state';
import { nextRef } from '../common/refs';
import { occUpdate } from '../common/occ';
import { paged } from '../common/pagination';

export interface NewIncident { title: string; description: string; categoryId: string; severity: any; lat: number; lng: number; lgaId: string; ward?: string; community?: string; address?: string; estAffected?: number; reportIds?: string[]; ownerId?: string; coordinatorId?: string }

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService) {}

  private async load(u: AuthUser, id: string, tx: Tx | PrismaService = this.prisma) {
    const i = await (tx as PrismaService).incident.findUnique({ where: { id } });
    if (!i) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
    assertInScope(u, i.lgaId);
    return i;
  }

  /** Used by manual creation AND report verification so both follow identical rules. */
  async createInTx(tx: Tx, u: AuthUser, d: NewIncident) {
    assertInScope(u, d.lgaId);
    const ref = await nextRef(tx, 'INC');
    const t = tx as PrismaService;
    const demo = d.reportIds?.length ? (await t.incidentReport.count({ where: { id: { in: d.reportIds }, isDemo: true } })) > 0 : process.env.APP_ENV !== 'production' && !!(await t.user.findFirst({ where: { id: u.id, isDemo: true } }));
    if (d.reportIds?.length) {
      const reps = await t.incidentReport.findMany({ where: { id: { in: d.reportIds } }, include: { links: true } });
      if (reps.length !== d.reportIds.length) throw new BadRequestException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      for (const r of reps) {
        if (r.status !== 'VERIFIED') throw new DomainError('REPORT_NOT_VERIFIED', `Report ${r.ref} must be verified before it can be linked to an incident`);
        if (r.links.length) throw new DomainError('REPORT_ALREADY_LINKED', `Report ${r.ref} is already linked to an incident`, 409);
        assertInScope(u, r.lgaId);
      }
    }
    const inc = await t.incident.create({ data: { ref, title: d.title, description: d.description, categoryId: d.categoryId, severity: d.severity, lat: d.lat, lng: d.lng, lgaId: d.lgaId,
      ward: d.ward, community: d.community, address: d.address, estAffected: d.estAffected, ownerId: d.ownerId, coordinatorId: d.coordinatorId, createdById: u.id, isDemo: demo,
      history: { create: { from: null, to: 'OPEN', actorId: u.id, reason: 'Incident created' } },
      reports: d.reportIds?.length ? { create: d.reportIds.map(reportId => ({ reportId, linkedById: u.id })) } : undefined,
      assignments: { create: [d.ownerId && { role: 'OWNER', userId: d.ownerId, assignedById: u.id }, d.coordinatorId && { role: 'COORDINATOR', userId: d.coordinatorId, assignedById: u.id }].filter(Boolean) as any } } });
    await t.incidentUpdate.create({ data: { incidentId: inc.id, type: 'UPDATE', body: `Incident ${ref} created${d.reportIds?.length ? ` from ${d.reportIds.length} verified report(s)` : ' manually'}.`, authorId: u.id } });
    await this.audit.log(u, { action: 'incidents.create', entityType: 'incident', entityId: inc.id, after: { ref, severity: d.severity, lgaId: d.lgaId, reportIds: d.reportIds } }, tx);
    await this.outbox.emit(tx, 'incident.created', { id: inc.id, ref, severity: inc.severity, lgaId: inc.lgaId }, inc.lgaId);
    await this.notify.toPermission(tx, 'incidents.assign', { type: 'incident.created', title: `Incident ${ref} created`, body: `${d.title} (${d.severity})`, entityType: 'incident', entityId: inc.id, lgaId: inc.lgaId }, u.id);
    return inc;
  }
  create(u: AuthUser, d: NewIncident) { return this.prisma.$transaction(tx => this.createInTx(tx, u, d)); }

  async list(u: AuthUser, q: any) {
    const where: any = { ...scopeWhere(u) };
    if (q.status) where.status = { in: q.status.split(',') };
    else if (q.active === 'true') where.status = { in: ['OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY'] };
    if (q.severity) where.severity = { in: q.severity.split(',') };
    if (q.category) where.category = { key: q.category };
    if (q.lgaId) where.lgaId = q.lgaId;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.from || q.to) where.createdAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }];
    const sortable = ['createdAt', 'updatedAt', 'severity', 'status', 'title', 'ref'];
    const orderBy: any = q.sort && sortable.includes(q.sort) ? [{ [q.sort]: q.dir || 'desc' }] : [{ severity: 'desc' }, { createdAt: 'desc' }]; // critical first
    const [rows, total] = await Promise.all([
      this.prisma.incident.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true, lga: true, _count: { select: { reports: true, deployments: true } } } }),
      this.prisma.incident.count({ where })]);
    return paged(rows.map(i => ({ id: i.id, ref: i.ref, title: i.title, category: i.category.label, categoryKey: i.category.key, severity: i.severity, status: i.status, lga: i.lga.name, lgaId: i.lgaId,
      estAffected: i.estAffected, verifiedAffected: i.verifiedAffected, ownerId: i.ownerId, createdAt: i.createdAt, updatedAt: i.updatedAt, reportCount: i._count.reports, deploymentCount: i._count.deployments, isDemo: i.isDemo, version: i.version })), total, q.page, q.pageSize);
  }

  async get(u: AuthUser, id: string) {
    const i = await this.prisma.incident.findUnique({ where: { id }, include: { category: true, lga: true,
      reports: { include: { report: { select: { id: true, ref: true, status: true, description: true, submittedAt: true } } } },
      updates: { orderBy: { at: 'desc' } }, history: { orderBy: { at: 'desc' } }, assignments: { orderBy: { at: 'desc' } }, media: true,
      deployments: { include: { team: { select: { id: true, name: true, code: true } } }, orderBy: { assignedAt: 'desc' } },
      allocations: { select: { id: true, ref: true, status: true, targetArea: true } }, households: { select: { id: true } } } });
    if (!i) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
    assertInScope(u, i.lgaId);
    const userIds = [...new Set([i.ownerId, i.coordinatorId, ...i.updates.map(x => x.authorId), ...i.history.map(h => h.actorId)].filter(Boolean) as string[])];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nm = Object.fromEntries(users.map(x => [x.id, x.name]));
    const timeline = [
      ...i.updates.map(x => ({ at: x.at, kind: x.type, text: x.body, by: nm[x.authorId], meta: x.meta })),
      ...i.history.map(h => ({ at: h.at, kind: 'STATUS', text: `${h.from ?? '—'} → ${h.to}${h.reason ? ` — ${h.reason}` : ''}`, by: h.actorId ? nm[h.actorId] : undefined })),
    ].sort((a, b) => +b.at - +a.at);
    return { ...i, category: i.category, lga: i.lga, ownerName: i.ownerId ? nm[i.ownerId] : null, coordinatorName: i.coordinatorId ? nm[i.coordinatorId] : null, timeline, householdCount: i.households.length };
  }

  async patch(u: AuthUser, id: string, d: any) {
    const cur = await this.load(u, id);
    if (['RESOLVED', 'CLOSED'].includes(cur.status)) throw new DomainError('INCIDENT_LOCKED', 'Resolved or closed incidents cannot be edited; reopen first');
    return this.prisma.$transaction(async tx => {
      const { version, status, ...rest } = d;
      const data: any = { ...rest };
      if (status && status !== cur.status) {
        if (['RESOLVED', 'CLOSED'].includes(status)) throw new DomainError('USE_DEDICATED_ENDPOINT', 'Use /resolve or /close for this transition');
        if (!canTransition(INCIDENT_TRANSITIONS, cur.status, status)) throw new DomainError('INVALID_TRANSITION', `Cannot move incident from ${cur.status} to ${status}`);
        data.status = status;
        await tx.incidentStatusHistory.create({ data: { incidentId: id, from: cur.status, to: status, actorId: u.id, reason: d.statusReason } });
      }
      delete data.statusReason;
      const upd = await occUpdate(tx, 'incident', id, version, data);
      await this.audit.log(u, { action: 'incidents.update', entityType: 'incident', entityId: id, before: pick(cur, Object.keys(data)), after: pick(upd, Object.keys(data)) }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, status: upd.status }, cur.lgaId);
      return upd;
    });
  }

  async addUpdate(u: AuthUser, id: string, type: 'UPDATE' | 'DECISION' | 'NOTE', body: string) {
    const cur = await this.load(u, id);
    return this.prisma.$transaction(async tx => {
      const r = await tx.incidentUpdate.create({ data: { incidentId: id, type, body, authorId: u.id } });
      await tx.incident.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.audit.log(u, { action: type === 'DECISION' ? 'incidents.decision' : 'incidents.update_added', entityType: 'incident', entityId: id, after: { body } }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, note: true }, cur.lgaId);
      return r;
    });
  }

  async assign(u: AuthUser, id: string, d: { ownerId?: string | null; coordinatorId?: string | null; reason?: string; version?: number }) {
    const cur = await this.load(u, id);
    if (d.ownerId === undefined && d.coordinatorId === undefined) throw new BadRequestException({ code: 'NOTHING_TO_ASSIGN', message: 'Provide ownerId and/or coordinatorId' });
    for (const uid of [d.ownerId, d.coordinatorId].filter(Boolean) as string[]) {
      const usr = await this.prisma.user.findFirst({ where: { id: uid, isActive: true } });
      if (!usr) throw new BadRequestException({ code: 'USER_UNAVAILABLE', message: 'Assignee not found or inactive' });
    }
    return this.prisma.$transaction(async tx => {
      const data: any = {};
      if (d.ownerId !== undefined) data.ownerId = d.ownerId;
      if (d.coordinatorId !== undefined) data.coordinatorId = d.coordinatorId;
      const upd = await occUpdate(tx, 'incident', id, d.version, data);
      if (d.ownerId !== undefined) await tx.incidentAssignment.create({ data: { incidentId: id, role: 'OWNER', userId: d.ownerId, assignedById: u.id } });
      if (d.coordinatorId !== undefined) await tx.incidentAssignment.create({ data: { incidentId: id, role: 'COORDINATOR', userId: d.coordinatorId, assignedById: u.id } });
      await tx.incidentUpdate.create({ data: { incidentId: id, type: 'OWNER_CHANGE', body: `Assignment changed${d.reason ? `: ${d.reason}` : ''}`, authorId: u.id, meta: { from: { ownerId: cur.ownerId, coordinatorId: cur.coordinatorId }, to: data } } });
      await this.audit.log(u, { action: 'incidents.assign', entityType: 'incident', entityId: id, before: { ownerId: cur.ownerId, coordinatorId: cur.coordinatorId }, after: data, reason: d.reason }, tx);
      for (const uid of [d.ownerId, d.coordinatorId].filter(Boolean) as string[]) await this.notify.toUser(tx, uid, { type: 'incident.assigned', title: `Assigned to ${cur.ref}`, body: cur.title, entityType: 'incident', entityId: id });
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, assignment: true }, cur.lgaId);
      return upd;
    });
  }

  async changeSeverity(u: AuthUser, id: string, severity: string, reason: string, version?: number) {
    const cur = await this.load(u, id);
    if (['RESOLVED', 'CLOSED'].includes(cur.status)) throw new DomainError('INCIDENT_LOCKED', 'Reopen the incident before changing severity');
    if (cur.severity === severity) throw new DomainError('NO_CHANGE', 'Severity is already ' + severity);
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incident', id, version, { severity });
      await tx.incidentUpdate.create({ data: { incidentId: id, type: 'SEVERITY_CHANGE', body: `Severity ${cur.severity} → ${severity}: ${reason}`, authorId: u.id, meta: { from: cur.severity, to: severity } } });
      await this.audit.log(u, { action: 'incidents.severity_change', entityType: 'incident', entityId: id, before: { severity: cur.severity }, after: { severity }, reason }, tx);
      await this.outbox.emit(tx, 'incident.severity_changed', { id, ref: cur.ref, from: cur.severity, to: severity }, cur.lgaId);
      const order = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
      if (order.indexOf(severity) > order.indexOf(cur.severity))
        await this.notify.toPermission(tx, 'deployments.assign', { type: 'incident.severity_escalated', title: `Severity escalated: ${cur.ref}`, body: `${cur.severity} → ${severity}. ${reason}`, entityType: 'incident', entityId: id, lgaId: cur.lgaId }, u.id);
      return upd;
    });
  }

  async linkReport(u: AuthUser, id: string, reportId: string) {
    const cur = await this.load(u, id);
    if (['RESOLVED', 'CLOSED'].includes(cur.status)) throw new DomainError('INCIDENT_LOCKED', 'Reopen the incident before linking reports');
    return this.prisma.$transaction(async tx => {
      const r = await tx.incidentReport.findUnique({ where: { id: reportId }, include: { links: true } });
      if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report not found' });
      assertInScope(u, r.lgaId);
      if (r.status !== 'VERIFIED') throw new DomainError('REPORT_NOT_VERIFIED', 'Only verified reports can be linked');
      if (r.links.length) throw new DomainError('REPORT_ALREADY_LINKED', 'Report is already linked to an incident', 409);
      await tx.incidentReportLink.create({ data: { incidentId: id, reportId, linkedById: u.id } });
      await tx.incidentUpdate.create({ data: { incidentId: id, type: 'REPORT_LINKED', body: `Report ${r.ref} linked`, authorId: u.id } });
      await this.audit.log(u, { action: 'incidents.link_report', entityType: 'incident', entityId: id, after: { reportId, ref: r.ref } }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, linkedReport: r.ref }, cur.lgaId);
    });
  }

  async resolve(u: AuthUser, id: string, summary: string, version?: number) {
    const cur = await this.load(u, id);
    if (!canTransition(INCIDENT_TRANSITIONS, cur.status, 'RESOLVED')) throw new DomainError('INVALID_TRANSITION', `Cannot resolve an incident that is ${cur.status}`);
    const active = await this.prisma.deployment.count({ where: { incidentId: id, status: { in: ACTIVE_DEPLOYMENT as any } } });
    if (active) throw new DomainError('ACTIVE_DEPLOYMENTS', `${active} deployment(s) are still active. Complete or cancel them first.`);
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incident', id, version, { status: 'RESOLVED', resolutionSummary: summary, resolvedAt: new Date() });
      await tx.incidentStatusHistory.create({ data: { incidentId: id, from: cur.status, to: 'RESOLVED', actorId: u.id, reason: summary } });
      await tx.incidentUpdate.create({ data: { incidentId: id, type: 'RESOLUTION', body: summary, authorId: u.id } });
      await this.audit.log(u, { action: 'incidents.resolve', entityType: 'incident', entityId: id, before: { status: cur.status }, after: { status: 'RESOLVED' }, reason: summary }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, status: 'RESOLVED' }, cur.lgaId);
      return upd;
    });
  }

  async close(u: AuthUser, id: string, version?: number) {
    const cur = await this.load(u, id);
    if (!cur.resolutionSummary?.trim()) throw new DomainError('RESOLUTION_REQUIRED', 'An incident cannot be closed without a resolution summary');
    if (cur.status !== 'RESOLVED') throw new DomainError('INVALID_TRANSITION', 'Only RESOLVED incidents can be closed');
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incident', id, version, { status: 'CLOSED', closedAt: new Date() });
      await tx.incidentStatusHistory.create({ data: { incidentId: id, from: 'RESOLVED', to: 'CLOSED', actorId: u.id } });
      await this.audit.log(u, { action: 'incidents.close', entityType: 'incident', entityId: id, before: { status: 'RESOLVED' }, after: { status: 'CLOSED' } }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, status: 'CLOSED' }, cur.lgaId);
      return upd;
    });
  }

  /** Reopen preserves ALL prior history; the previous resolution summary is kept in the timeline. */
  async reopen(u: AuthUser, id: string, reason: string, version?: number) {
    const cur = await this.load(u, id);
    if (!['RESOLVED', 'CLOSED'].includes(cur.status)) throw new DomainError('INVALID_TRANSITION', 'Only resolved or closed incidents can be reopened');
    const to = cur.status === 'CLOSED' ? 'OPEN' : 'RESPONSE_ACTIVE';
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incident', id, version, { status: to, resolvedAt: null, closedAt: null });
      await tx.incidentStatusHistory.create({ data: { incidentId: id, from: cur.status, to: to as any, actorId: u.id, reason } });
      await tx.incidentUpdate.create({ data: { incidentId: id, type: 'REOPEN', body: `Reopened: ${reason}`, authorId: u.id, meta: { previousResolution: cur.resolutionSummary, previousStatus: cur.status } } });
      await this.audit.log(u, { action: 'incidents.reopen', entityType: 'incident', entityId: id, before: { status: cur.status }, after: { status: to }, reason }, tx);
      await this.outbox.emit(tx, 'incident.updated', { id, ref: cur.ref, status: to }, cur.lgaId);
      await this.notify.toPermission(tx, 'incidents.assign', { type: 'incident.reopened', title: `Incident reopened: ${cur.ref}`, body: reason, entityType: 'incident', entityId: id, lgaId: cur.lgaId }, u.id);
      return upd;
    });
  }
}

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.map(k => [k, o[k]]));
export { ForbiddenException };
