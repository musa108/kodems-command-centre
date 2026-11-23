import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { AuthUser } from '../common/auth.types';
import { DomainError } from '../common/errors';
import { assertInScope, scopeWhere } from '../common/scope';
import { ACTIVE_DEPLOYMENT, canTransition, DEPLOYMENT_TRANSITIONS } from '../common/state';
import { nextRef } from '../common/refs';
import { occUpdate } from '../common/occ';
import { paged } from '../common/pagination';

const TS: Record<string, string> = { ACCEPTED: 'acceptedAt', EN_ROUTE: 'departedAt', ON_SITE: 'arrivedAt', COMPLETED: 'completedAt' };
const EVT: Record<string, string> = { ACCEPTED: 'deployment.accepted', EN_ROUTE: 'deployment.en_route', ON_SITE: 'deployment.arrived', COMPLETED: 'deployment.completed' };

@Injectable()
export class DeploymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService) {}

  private async load(u: AuthUser, id: string) {
    const d = await this.prisma.deployment.findUnique({ where: { id }, include: { incident: { select: { lgaId: true, ref: true, status: true } }, team: true } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Deployment not found' });
    assertInScope(u, d.incident.lgaId);
    return d;
  }

  async list(u: AuthUser, q: any) {
    const where: any = { incident: { ...scopeWhere(u) } };
    if (q.status) where.status = { in: q.status.split(',') }; else if (q.active === 'true') where.status = { in: ACTIVE_DEPLOYMENT };
    if (q.incidentId) where.incidentId = q.incidentId;
    if (q.teamId) where.teamId = q.teamId;
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, { destination: { contains: q.q, mode: 'insensitive' } }, { team: { name: { contains: q.q, mode: 'insensitive' } } }];
    const [rows, total] = await Promise.all([
      this.prisma.deployment.findMany({ where, orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { team: { select: { id: true, name: true, code: true } }, incident: { select: { id: true, ref: true, title: true, severity: true } } } }),
      this.prisma.deployment.count({ where })]);
    // Active first (ASSIGNED..ON_SITE sort before COMPLETED... by enum order), then most recent.
    return paged(rows.map(d => ({ id: d.id, ref: d.ref, status: d.status, priority: d.priority, destination: d.destination, assignedAt: d.assignedAt, acceptedAt: d.acceptedAt, arrivedAt: d.arrivedAt, completedAt: d.completedAt, team: d.team, incident: d.incident, isDemo: d.isDemo, version: d.version })), total, q.page, q.pageSize);
  }

  async get(u: AuthUser, id: string) {
    const d = await this.load(u, id);
    const full = await this.prisma.deployment.findUniqueOrThrow({ where: { id }, include: { team: { include: { category: true } }, incident: { select: { id: true, ref: true, title: true, severity: true, lat: true, lng: true } }, updates: { orderBy: { at: 'desc' } }, history: { orderBy: { at: 'desc' } } } });
    const ids = [...new Set([full.assignedById, ...full.updates.map(x => x.authorId), ...full.history.map(h => h.actorId)].filter(Boolean) as string[])];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nm = Object.fromEntries(users.map(x => [x.id, x.name]));
    return { ...full, assignedByName: nm[full.assignedById], updates: full.updates.map(x => ({ ...x, authorName: nm[x.authorId] })), history: full.history.map(h => ({ ...h, actorName: h.actorId ? nm[h.actorId] : null })), _scope: d.incident.lgaId };
  }

  async create(u: AuthUser, b: any) {
    const inc = await this.prisma.incident.findUnique({ where: { id: b.incidentId } });
    if (!inc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
    assertInScope(u, inc.lgaId);
    if (['RESOLVED', 'CLOSED'].includes(inc.status)) throw new DomainError('INCIDENT_LOCKED', 'Cannot deploy to a resolved or closed incident');
    return this.prisma.$transaction(async tx => {
      // Row-lock the team so two coordinators cannot double-book it.
      const rows: any[] = await tx.$queryRaw`SELECT id, status, name FROM response_teams WHERE id = ${b.teamId}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team not found' });
      if (rows[0].status !== 'AVAILABLE') throw new DomainError('TEAM_UNAVAILABLE', `Team ${rows[0].name} is ${rows[0].status} and cannot be assigned`, 409);
      const ref = await nextRef(tx, 'DEP');
      const dep = await tx.deployment.create({ data: { ref, incidentId: b.incidentId, teamId: b.teamId, assignedById: u.id, destination: b.destination, priority: b.priority ?? inc.severity, instructions: b.instructions, requiredResources: b.requiredResources,
        isDemo: inc.isDemo, history: { create: { from: null, to: 'ASSIGNED', actorId: u.id, reason: 'Assigned' } } } });
      await tx.responseTeam.update({ where: { id: b.teamId }, data: { status: 'DEPLOYED', version: { increment: 1 } } });
      if (inc.status === 'OPEN' || inc.status === 'ASSESSMENT') {
        await tx.incident.update({ where: { id: inc.id }, data: { status: 'RESPONSE_ACTIVE', version: { increment: 1 } } });
        await tx.incidentStatusHistory.create({ data: { incidentId: inc.id, from: inc.status, to: 'RESPONSE_ACTIVE', actorId: u.id, reason: `Deployment ${ref} assigned` } });
      }
      await tx.incidentUpdate.create({ data: { incidentId: inc.id, type: 'UPDATE', body: `${rows[0].name} assigned (${ref}).`, authorId: u.id } });
      await this.audit.log(u, { action: 'deployments.assign', entityType: 'deployment', entityId: dep.id, after: { ref, incidentId: inc.id, teamId: b.teamId } }, tx);
      await this.outbox.emit(tx, 'deployment.created', { id: dep.id, ref, incidentId: inc.id, teamId: b.teamId }, inc.lgaId);
      await this.notify.toPermission(tx, 'deployments.read', { type: 'deployment.assigned', title: `Team assigned: ${ref}`, body: `${rows[0].name} → ${inc.ref}`, entityType: 'deployment', entityId: dep.id, lgaId: inc.lgaId }, u.id);
      return dep;
    });
  }

  /** Single transition point for ACCEPTED / EN_ROUTE / ON_SITE / COMPLETED / CANCELLED. */
  async advance(u: AuthUser, id: string, to: string, opts: { reason?: string; completionReport?: string; version?: number; lat?: number; lng?: number } = {}) {
    const d = await this.load(u, id);
    if (!canTransition(DEPLOYMENT_TRANSITIONS, d.status, to)) throw new DomainError('INVALID_TRANSITION', `Deployment ${d.ref} is ${d.status}; cannot move to ${to}`);
    if (to === 'CANCELLED' && !opts.reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to cancel' });
    if (to === 'COMPLETED' && !opts.completionReport?.trim()) throw new BadRequestException({ code: 'REPORT_REQUIRED', message: 'A completion report is required' });
    return this.prisma.$transaction(async tx => {
      const data: any = { status: to, ...(TS[to] ? { [TS[to]]: new Date() } : {}) };
      if (to === 'CANCELLED') data.cancelReason = opts.reason;
      if (to === 'COMPLETED') data.completionReport = opts.completionReport;
      const upd = await occUpdate(tx, 'deployment', id, opts.version, data);
      await tx.deploymentStatusHistory.create({ data: { deploymentId: id, from: d.status, to: to as any, actorId: u.id, reason: opts.reason } });
      if (opts.lat != null && opts.lng != null) await tx.responseTeam.update({ where: { id: d.teamId }, data: { lastLat: opts.lat, lastLng: opts.lng, lastLocationAt: new Date() } });
      if (['COMPLETED', 'CANCELLED'].includes(to)) await tx.responseTeam.update({ where: { id: d.teamId }, data: { status: 'AVAILABLE', version: { increment: 1 } } });
      await this.audit.log(u, { action: `deployments.${to.toLowerCase()}`, entityType: 'deployment', entityId: id, before: { status: d.status }, after: { status: to }, reason: opts.reason }, tx);
      await this.outbox.emit(tx, EVT[to] ?? 'deployment.updated', { id, ref: d.ref, incidentId: d.incidentId, status: to }, d.incident.lgaId);
      if (EVT[to]) await this.notify.toPermission(tx, 'deployments.assign', { type: EVT[to], title: `${d.ref}: ${to.replace('_', ' ')}`, body: `${d.team.name} — ${d.incident.ref}`, entityType: 'deployment', entityId: id, lgaId: d.incident.lgaId }, u.id);
      return upd;
    });
  }

  async patch(u: AuthUser, id: string, b: any) {
    const d = await this.load(u, id);
    if (!ACTIVE_DEPLOYMENT.includes(d.status)) throw new DomainError('DEPLOYMENT_CLOSED', 'Closed deployments cannot be edited');
    const { version, status, ...rest } = b;
    if (status) return this.advance(u, id, status, { version, reason: b.reason });
    return this.prisma.$transaction(async tx => {
      const upd = await occUpdate(tx, 'deployment', id, version, rest);
      await this.audit.log(u, { action: 'deployments.update', entityType: 'deployment', entityId: id, before: { instructions: d.instructions, priority: d.priority }, after: rest }, tx);
      await this.outbox.emit(tx, 'deployment.updated', { id, ref: d.ref }, d.incident.lgaId);
      return upd;
    });
  }

  async addUpdate(u: AuthUser, id: string, b: { kind: string; message: string; lat?: number; lng?: number }, idem?: string) {
    const d = await this.load(u, id);
    if (idem) { const ex = await this.prisma.deploymentUpdate.findUnique({ where: { idempotencyKey: idem } }); if (ex) return ex; }
    return this.prisma.$transaction(async tx => {
      const up = await tx.deploymentUpdate.create({ data: { deploymentId: id, authorId: u.id, idempotencyKey: idem, ...b } });
      if (b.lat != null && b.lng != null) await tx.responseTeam.update({ where: { id: d.teamId }, data: { lastLat: b.lat, lastLng: b.lng, lastLocationAt: new Date() } });
      await this.audit.log(u, { action: `deployments.${b.kind.toLowerCase()}`, entityType: 'deployment', entityId: id, after: { message: b.message } }, tx);
      await this.outbox.emit(tx, b.lat != null ? 'team.location_updated' : 'deployment.updated', { id, ref: d.ref, kind: b.kind, teamId: d.teamId }, d.incident.lgaId);
      if (['RESOURCE_REQUEST', 'ESCALATION', 'CHALLENGE'].includes(b.kind))
        await this.notify.toPermission(tx, 'deployments.assign', { type: `deployment.${b.kind.toLowerCase()}`, title: `${d.ref}: ${b.kind.replace('_', ' ').toLowerCase()}`, body: b.message.slice(0, 140), entityType: 'deployment', entityId: id, lgaId: d.incident.lgaId }, u.id);
      return up;
    });
  }

  /** Reassign to another team with a mandatory reason; old deployment becomes REASSIGNED, a new one is created atomically. */
  async reassign(u: AuthUser, id: string, b: { teamId: string; reason: string }) {
    const d = await this.load(u, id);
    if (!canTransition(DEPLOYMENT_TRANSITIONS, d.status, 'REASSIGNED')) throw new DomainError('INVALID_TRANSITION', `Cannot reassign a ${d.status} deployment`);
    if (b.teamId === d.teamId) throw new DomainError('SAME_TEAM', 'Choose a different team');
    return this.prisma.$transaction(async tx => {
      const rows: any[] = await tx.$queryRaw`SELECT id, status, name FROM response_teams WHERE id = ${b.teamId}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team not found' });
      if (rows[0].status !== 'AVAILABLE') throw new DomainError('TEAM_UNAVAILABLE', `Team ${rows[0].name} is ${rows[0].status}`, 409);
      const ref = await nextRef(tx, 'DEP');
      const nd = await tx.deployment.create({ data: { ref, incidentId: d.incidentId, teamId: b.teamId, assignedById: u.id, destination: d.destination, priority: d.priority, instructions: d.instructions, requiredResources: d.requiredResources, isDemo: d.isDemo,
        history: { create: { from: null, to: 'ASSIGNED', actorId: u.id, reason: `Reassigned from ${d.ref}: ${b.reason}` } } } });
      await tx.deployment.update({ where: { id }, data: { status: 'REASSIGNED', reassignedToId: nd.id, cancelReason: b.reason, version: { increment: 1 } } });
      await tx.deploymentStatusHistory.create({ data: { deploymentId: id, from: d.status, to: 'REASSIGNED', actorId: u.id, reason: b.reason } });
      await tx.responseTeam.update({ where: { id: d.teamId }, data: { status: 'AVAILABLE', version: { increment: 1 } } });
      await tx.responseTeam.update({ where: { id: b.teamId }, data: { status: 'DEPLOYED', version: { increment: 1 } } });
      await tx.incidentUpdate.create({ data: { incidentId: d.incidentId, type: 'UPDATE', body: `${d.team.name} reassigned to ${rows[0].name}: ${b.reason}`, authorId: u.id } });
      await this.audit.log(u, { action: 'deployments.reassign', entityType: 'deployment', entityId: id, before: { teamId: d.teamId }, after: { teamId: b.teamId, newDeployment: ref }, reason: b.reason }, tx);
      await this.outbox.emit(tx, 'deployment.created', { id: nd.id, ref, incidentId: d.incidentId, teamId: b.teamId, reassignedFrom: d.ref }, d.incident.lgaId);
      return nd;
    });
  }
}
