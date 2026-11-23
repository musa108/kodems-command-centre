import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { IncidentsService, NewIncident } from '../incidents/incidents.service';
import { AuthUser } from '../common/auth.types';
import { DomainError } from '../common/errors';
import { assertInScope, scopeWhere } from '../common/scope';
import { canTransition, REPORT_TRANSITIONS } from '../common/state';
import { nextRef } from '../common/refs';
import { occUpdate } from '../common/occ';
import { paged } from '../common/pagination';

const PENDING = ['SUBMITTED', 'UNDER_REVIEW'];

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService, private incidents: IncidentsService) {}

  private async load(u: AuthUser, id: string) {
    const r = await this.prisma.incidentReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report not found' });
    assertInScope(u, r.lgaId);
    return r;
  }
  private transition(r: { status: string; ref: string }, to: string) {
    if (!canTransition(REPORT_TRANSITIONS, r.status, to)) throw new DomainError('INVALID_TRANSITION', `Report ${r.ref} is ${r.status} and cannot become ${to}`);
  }

  async list(u: AuthUser, q: any) {
    const where: any = { ...scopeWhere(u) };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.category) where.category = { key: q.category };
    if (q.severity) where.suggestedSeverity = { in: q.severity.split(',') };
    if (q.lgaId) where.lgaId = q.lgaId;
    if (q.assigned === 'me') where.assignedOfficerId = u.id; else if (q.assigned === 'none') where.assignedOfficerId = null;
    if (q.from || q.to) where.submittedAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { address: { contains: q.q, mode: 'insensitive' } }];
    const queueView = !q.status || q.status.split(',').every((s: string) => PENDING.includes(s));
    const sortable = ['submittedAt', 'suggestedSeverity', 'status', 'ref'];
    const orderBy: any = q.sort && sortable.includes(q.sort) ? [{ [q.sort]: q.dir || 'desc' }]
      : queueView ? [{ suggestedSeverity: 'desc' }, { submittedAt: 'asc' }] /* urgent first, then oldest first */ : [{ submittedAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.incidentReport.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true, lga: true, links: { select: { incidentId: true } } } }),
      this.prisma.incidentReport.count({ where })]);
    const canPII = u.permissions.has('incidents.verify');
    return paged(rows.map(r => ({ id: r.id, ref: r.ref, category: r.category.label, categoryKey: r.category.key, description: r.description.slice(0, 160), status: r.status, severity: r.suggestedSeverity,
      lga: r.lga.name, lgaId: r.lgaId, community: r.community, submittedAt: r.submittedAt, incidentAt: r.incidentAt, estAffected: r.estAffected, assignedOfficerId: r.assignedOfficerId,
      incidentId: r.links[0]?.incidentId ?? null, reporterName: canPII ? r.reporterName : undefined, isDemo: r.isDemo, version: r.version })), total, q.page, q.pageSize);
  }

  async get(u: AuthUser, id: string) {
    const r = await this.prisma.incidentReport.findUnique({ where: { id }, include: { category: true, lga: true, media: true, notes: { orderBy: { createdAt: 'desc' } }, history: { orderBy: { at: 'desc' } }, links: { include: { incident: { select: { id: true, ref: true, title: true } } } } } });
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report not found' });
    assertInScope(u, r.lgaId);
    const ids = [...new Set([r.assignedOfficerId, ...r.notes.map(n => n.authorId), ...r.history.map(h => h.actorId)].filter(Boolean) as string[])];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nm = Object.fromEntries(users.map(x => [x.id, x.name]));
    // Possible duplicates: same category, within ~2 km and 48 h, still open.
    const near: any[] = await this.prisma.$queryRaw`
      SELECT r.id, r.ref, r.status, r.description FROM incident_reports r
      WHERE r.id <> ${id}::uuid AND r."categoryId" = ${r.categoryId}::uuid AND r.status <> 'REJECTED'
        AND r."incidentAt" BETWEEN ${new Date(+r.incidentAt - 48 * 3600e3)} AND ${new Date(+r.incidentAt + 48 * 3600e3)}
        AND ST_DWithin(ST_SetSRID(ST_MakePoint(r.lng, r.lat),4326)::geography, ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}),4326)::geography, 2000)
      ORDER BY ST_Distance(ST_SetSRID(ST_MakePoint(r.lng, r.lat),4326)::geography, ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}),4326)::geography), r."submittedAt" DESC LIMIT 5`;
    return { ...r, category: r.category, lga: r.lga, assignedOfficerName: r.assignedOfficerId ? nm[r.assignedOfficerId] : null,
      notes: r.notes.map(n => ({ ...n, authorName: nm[n.authorId] })), history: r.history.map(h => ({ ...h, actorName: h.actorId ? nm[h.actorId] : null })),
      incident: r.links[0]?.incident ?? null, possibleDuplicates: near };
  }

  async create(u: AuthUser, d: any, idemKey?: string) {
    assertInScope(u, d.lgaId);
    if (idemKey) { const ex = await this.prisma.incidentReport.findUnique({ where: { idempotencyKey: idemKey } }); if (ex) return ex; }
    const demo = process.env.APP_ENV !== 'production' && !!(await this.prisma.user.findFirst({ where: { id: u.id, isDemo: true } }));
    return this.prisma.$transaction(async tx => {
      const ref = await nextRef(tx, 'RPT');
      const r = await tx.incidentReport.create({ data: { ref, ...d, incidentAt: new Date(d.incidentAt), idempotencyKey: idemKey, isDemo: demo, history: { create: { from: null, to: 'SUBMITTED', actorId: u.id, reason: 'Submitted via web channel' } } } });
      await this.audit.log(u, { action: 'reports.create', entityType: 'report', entityId: r.id, after: { ref, categoryId: d.categoryId, lgaId: d.lgaId } }, tx);
      await this.outbox.emit(tx, 'report.created', { id: r.id, ref, severity: r.suggestedSeverity, lgaId: r.lgaId }, r.lgaId);
      await this.notify.toPermission(tx, 'incidents.verify', { type: r.suggestedSeverity === 'CRITICAL' ? 'report.critical' : 'report.created', title: r.suggestedSeverity === 'CRITICAL' ? `CRITICAL report ${ref}` : `New report ${ref}`, body: d.description.slice(0, 120), entityType: 'report', entityId: r.id, lgaId: r.lgaId });
      return r;
    });
  }

  async assign(u: AuthUser, id: string, officerId: string) {
    const r = await this.load(u, id);
    if (!PENDING.includes(r.status)) throw new DomainError('INVALID_TRANSITION', 'Only pending reports can be assigned');
    const off = await this.prisma.user.findFirst({ where: { id: officerId, isActive: true, roles: { some: { role: { permissions: { some: { permission: { key: 'incidents.verify' } } } } } } } });
    if (!off) throw new BadRequestException({ code: 'NOT_A_VERIFIER', message: 'Selected user cannot verify reports' });
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incidentReport', id, undefined, { assignedOfficerId: officerId, status: 'UNDER_REVIEW' });
      if (r.status !== 'UNDER_REVIEW') await tx.reportStatusHistory.create({ data: { reportId: id, from: r.status, to: 'UNDER_REVIEW', actorId: u.id, reason: `Assigned to ${off.name}` } });
      await this.audit.log(u, { action: 'reports.assign', entityType: 'report', entityId: id, before: { assignedOfficerId: r.assignedOfficerId }, after: { assignedOfficerId: officerId } }, tx);
      await this.notify.toUser(tx, officerId, { type: 'report.assigned', title: `Report ${r.ref} assigned to you`, body: r.description.slice(0, 120), entityType: 'report', entityId: id });
      await this.outbox.emit(tx, 'report.updated', { id, ref: r.ref, status: 'UNDER_REVIEW' }, r.lgaId);
      return upd;
    });
  }

  /** Verification is an explicit authorised action. `incident` must be chosen explicitly — nothing becomes an incident silently. */
  async verify(u: AuthUser, id: string, d: { version?: number; note?: string; incident: { mode: 'none' } | { mode: 'link'; incidentId: string } | { mode: 'create'; data: Omit<NewIncident, 'reportIds' | 'lgaId' | 'lat' | 'lng'> & Partial<Pick<NewIncident, 'lgaId' | 'lat' | 'lng'>> } }) {
    const r = await this.load(u, id);
    this.transition(r, 'VERIFIED');
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incidentReport', id, d.version, { status: 'VERIFIED', verifiedAt: new Date() });
      await tx.reportStatusHistory.create({ data: { reportId: id, from: r.status, to: 'VERIFIED', actorId: u.id, reason: d.note } });
      let incident: any = null;
      if (d.incident.mode === 'create') {
        incident = await this.incidents.createInTx(tx, u, { ...d.incident.data, lgaId: d.incident.data.lgaId ?? r.lgaId, lat: d.incident.data.lat ?? r.lat, lng: d.incident.data.lng ?? r.lng,
          ward: r.ward ?? undefined, community: r.community ?? undefined, address: r.address ?? undefined, estAffected: d.incident.data.estAffected ?? r.estAffected ?? undefined, reportIds: [id] });
      } else if (d.incident.mode === 'link') {
        const inc = await tx.incident.findUnique({ where: { id: d.incident.incidentId } });
        if (!inc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
        assertInScope(u, inc.lgaId);
        if (['RESOLVED', 'CLOSED'].includes(inc.status)) throw new DomainError('INCIDENT_LOCKED', 'Reopen the incident before linking reports');
        await tx.incidentReportLink.create({ data: { incidentId: inc.id, reportId: id, linkedById: u.id } });
        await tx.incidentUpdate.create({ data: { incidentId: inc.id, type: 'REPORT_LINKED', body: `Report ${r.ref} verified and linked`, authorId: u.id } });
        incident = inc;
      }
      await this.audit.log(u, { action: 'reports.verify', entityType: 'report', entityId: id, before: { status: r.status }, after: { status: 'VERIFIED', incidentId: incident?.id ?? null }, reason: d.note }, tx);
      await this.outbox.emit(tx, 'report.verified', { id, ref: r.ref, incidentId: incident?.id ?? null }, r.lgaId);
      await this.notify.toPermission(tx, 'incidents.create', { type: 'report.verified', title: `Report ${r.ref} verified`, body: incident ? `Linked to ${incident.ref}` : 'No incident created yet', entityType: 'report', entityId: id, lgaId: r.lgaId }, u.id);
      return { report: upd, incident };
    });
  }

  async reject(u: AuthUser, id: string, reason: string, version?: number) {
    const r = await this.load(u, id); this.transition(r, 'REJECTED');
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incidentReport', id, version, { status: 'REJECTED', rejectionReason: reason });
      await tx.reportStatusHistory.create({ data: { reportId: id, from: r.status, to: 'REJECTED', actorId: u.id, reason } });
      await this.audit.log(u, { action: 'reports.reject', entityType: 'report', entityId: id, before: { status: r.status }, after: { status: 'REJECTED' }, reason }, tx);
      await this.outbox.emit(tx, 'report.updated', { id, ref: r.ref, status: 'REJECTED' }, r.lgaId);
      return upd;
    });
  }

  async markDuplicate(u: AuthUser, id: string, originalId: string, version?: number) {
    const r = await this.load(u, id); this.transition(r, 'DUPLICATE');
    if (originalId === id) throw new DomainError('SELF_DUPLICATE', 'A report cannot duplicate itself');
    const orig = await this.load(u, originalId);
    if (orig.status === 'DUPLICATE' || orig.status === 'REJECTED') throw new DomainError('BAD_ORIGINAL', `Original report is ${orig.status}; choose the canonical report`);
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incidentReport', id, version, { status: 'DUPLICATE', duplicateOfId: originalId });
      await tx.reportStatusHistory.create({ data: { reportId: id, from: r.status, to: 'DUPLICATE', actorId: u.id, reason: `Duplicate of ${orig.ref}` } });
      await this.audit.log(u, { action: 'reports.duplicate', entityType: 'report', entityId: id, before: { status: r.status }, after: { status: 'DUPLICATE', duplicateOf: orig.ref } }, tx);
      await this.outbox.emit(tx, 'report.updated', { id, ref: r.ref, status: 'DUPLICATE' }, r.lgaId);
      return upd;
    });
  }

  async addNote(u: AuthUser, id: string, text: string) {
    const r = await this.load(u, id);
    return this.prisma.$transaction(async tx => {
      const n = await tx.reportNote.create({ data: { reportId: id, authorId: u.id, body: text } });
      await this.audit.log(u, { action: 'reports.note', entityType: 'report', entityId: id, after: { note: text } }, tx);
      return { ...n, ref: r.ref };
    });
  }

  async escalate(u: AuthUser, id: string, reason: string) {
    const r = await this.load(u, id);
    if (!PENDING.includes(r.status)) throw new DomainError('INVALID_TRANSITION', 'Only pending reports can be escalated');
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'incidentReport', id, undefined, { suggestedSeverity: 'CRITICAL' });
      await tx.reportNote.create({ data: { reportId: id, authorId: u.id, body: `ESCALATED to CRITICAL: ${reason}` } });
      await this.audit.log(u, { action: 'reports.escalate', entityType: 'report', entityId: id, before: { severity: r.suggestedSeverity }, after: { severity: 'CRITICAL' }, reason }, tx);
      await this.notify.toPermission(tx, 'deployments.assign', { type: 'report.critical', title: `Escalated report ${r.ref}`, body: reason, entityType: 'report', entityId: id, lgaId: r.lgaId }, u.id);
      await this.outbox.emit(tx, 'report.updated', { id, ref: r.ref, escalated: true }, r.lgaId);
      return upd;
    });
  }
}
