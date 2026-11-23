import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from './notify.service';
import { JobsService } from '../common/jobs.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body, DomainError } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { nextRef } from '../common/refs';

const alertS = z.object({ title: z.string().trim().min(5).max(120), message: z.string().trim().min(10).max(600), categoryId: z.string().uuid(), severity: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  targetLgaIds: z.array(z.string().uuid()).min(1, 'Select at least one LGA'), targetArea: z.string().max(200).optional(), publishAt: z.string().datetime({ offset: true }).optional(), expiresAt: z.string().datetime({ offset: true }),
  channels: z.array(z.enum(['SMS', 'EMAIL', 'PUSH'])).default([]) });

@Controller()
export class NotificationsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService, private jobs: JobsService) {}

  @Get('notifications') @Perm('notifications.read')
  async list(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const q = pageQuery.parse(raw); const where: any = { userId: u.id, ...(raw.unread === 'true' ? { readAt: null } : {}) };
    const [rows, total, unread] = await Promise.all([this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), this.prisma.notification.count({ where }), this.prisma.notification.count({ where: { userId: u.id, readAt: null } })]);
    return { ...paged(rows, total, q.page, q.pageSize), unread };
  }
  @Patch('notifications/:id/read') @Perm('notifications.read')
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } }); return { updated: r.count };
  }
  @Post('notifications/read-all') @Perm('notifications.read')
  async readAll(@CurrentUser() u: AuthUser) { return { updated: (await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } })).count }; }

  // ── Public alerts ──
  private async expireDue() {
    const due = await this.prisma.publicAlert.findMany({ where: { status: 'PUBLISHED', expiresAt: { lt: new Date() } }, select: { id: true } });
    for (const a of due) { await this.prisma.publicAlert.update({ where: { id: a.id }, data: { status: 'EXPIRED', version: { increment: 1 } } }); await this.prisma.alertApproval.create({ data: { alertId: a.id, approverId: (await this.prisma.publicAlert.findUniqueOrThrow({ where: { id: a.id } })).issuedById, decision: 'EXPIRED', comment: 'Automatic expiry' } }); }
  }
  @Get('alerts') @Perm('alerts.read')
  async alerts(@CurrentUser() u: AuthUser, @Query() raw: any) {
    await this.expireDue(); const q = pageQuery.parse(raw);
    const where: any = { ...(raw.status ? { status: { in: String(raw.status).split(',') } } : {}) };
    if (u.lgaScope !== null) where.targetLgaIds = { hasSome: u.lgaScope };
    const [rows, total] = await Promise.all([this.prisma.publicAlert.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true, approvals: { orderBy: { at: 'desc' } }, deliveries: true } }), this.prisma.publicAlert.count({ where })]);
    return paged(rows.map(a => ({ ...a, category: a.category.label })), total, q.page, q.pageSize);
  }
  @Post('alerts') @Perm('alerts.draft')
  async create(@CurrentUser() u: AuthUser, @Body(body(alertS)) b: z.infer<typeof alertS>) {
    if (new Date(b.expiresAt) <= new Date()) throw new DomainError('BAD_EXPIRY', 'Expiry must be in the future');
    if (u.lgaScope !== null && b.targetLgaIds.some(i => !u.lgaScope!.includes(i))) throw new DomainError('OUT_OF_SCOPE', 'Target LGA outside your scope', 403);
    const demo = process.env.APP_ENV !== 'production' && !!(await this.prisma.user.findFirst({ where: { id: u.id, isDemo: true } }));
    return this.prisma.$transaction(async tx => {
      const { channels, ...rest } = b; // channels recorded in the first history entry
      const a = await tx.publicAlert.create({ data: { ...rest, publishAt: rest.publishAt ? new Date(rest.publishAt) : undefined, expiresAt: new Date(rest.expiresAt), ref: await nextRef(tx, 'ALR'), issuedById: u.id, isDemo: demo,
        approvals: { create: { approverId: u.id, decision: 'DRAFTED', comment: channels.length ? `channels:${channels.join(',')}` : undefined } } } });
      await this.audit.log(u, { action: 'alerts.draft', entityType: 'alert', entityId: a.id, after: b }, tx); return a;
    });
  }
  private async loadA(id: string) { const a = await this.prisma.publicAlert.findUnique({ where: { id } }); if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Alert not found' }); return a; }
  @Patch('alerts/:id') @Perm('alerts.draft')
  async amend(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(alertS.partial().omit({ channels: true }))) b: any) {
    const a = await this.loadA(id);
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(a.status)) throw new DomainError('ALERT_LOCKED', `A ${a.status} alert cannot be amended; cancel and draft a new one`);
    return this.prisma.$transaction(async tx => {
      const upd = await tx.publicAlert.update({ where: { id }, data: { ...b, expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined, publishAt: b.publishAt ? new Date(b.publishAt) : undefined, status: 'DRAFT', version: { increment: 1 } } }); // amending withdraws any pending approval
      await tx.alertApproval.create({ data: { alertId: id, approverId: u.id, decision: 'AMENDED', comment: `Previous: ${a.title} | ${a.message}`.slice(0, 600) } });
      await this.audit.log(u, { action: 'alerts.amend', entityType: 'alert', entityId: id, before: { title: a.title, message: a.message, status: a.status }, after: b }, tx); return upd;
    });
  }
  @Post('alerts/:id/submit-approval') @Perm('alerts.draft')
  async submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.loadA(id); if (a.status !== 'DRAFT') throw new DomainError('INVALID_TRANSITION', `Alert is ${a.status}`);
    return this.prisma.$transaction(async tx => {
      const upd = await tx.publicAlert.update({ where: { id }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } } });
      await tx.alertApproval.create({ data: { alertId: id, approverId: u.id, decision: 'SUBMITTED' } });
      await this.audit.log(u, { action: 'alerts.submit', entityType: 'alert', entityId: id }, tx);
      await this.notify.toPermission(tx, 'alerts.approve', { type: 'alert.pending', title: `Alert ${a.ref} awaits approval`, body: a.title, entityType: 'alert', entityId: id }, u.id); return upd;
    });
  }
  @Post('alerts/:id/approve') @Perm('alerts.approve')
  async approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['APPROVED', 'REJECTED']).default('APPROVED'), comment: z.string().max(500).optional() }))) b: { decision: 'APPROVED' | 'REJECTED'; comment?: string }) {
    const a = await this.loadA(id); if (a.status !== 'PENDING_APPROVAL') throw new DomainError('INVALID_TRANSITION', `Alert is ${a.status}`);
    if (a.issuedById === u.id) throw new DomainError('SEGREGATION_OF_DUTIES', 'The issuing officer cannot approve their own alert', 403);
    if (b.decision === 'REJECTED' && !b.comment) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject' });
    return this.prisma.$transaction(async tx => {
      const upd = await tx.publicAlert.update({ where: { id }, data: { status: b.decision === 'APPROVED' ? 'APPROVED' : 'DRAFT', version: { increment: 1 } } });
      await tx.alertApproval.create({ data: { alertId: id, approverId: u.id, decision: b.decision, comment: b.comment } });
      await this.audit.log(u, { action: `alerts.${b.decision.toLowerCase()}`, entityType: 'alert', entityId: id, reason: b.comment }, tx); return upd;
    });
  }
  @Post('alerts/:id/publish') @Perm('alerts.publish')
  async publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.loadA(id);
    if (a.status !== 'APPROVED') throw new DomainError('APPROVAL_REQUIRED', 'A public alert cannot be published without approval', 409);
    if (a.expiresAt && a.expiresAt <= new Date()) throw new DomainError('ALERT_EXPIRED', 'Alert has already expired');
    const first = await this.prisma.alertApproval.findFirst({ where: { alertId: id, decision: 'DRAFTED' } });
    const channels = (first?.comment?.startsWith('channels:') ? first.comment.slice(9).split(',') : []) as Array<'SMS' | 'EMAIL' | 'PUSH'>;
    const upd = await this.prisma.$transaction(async tx => {
      const upd = await tx.publicAlert.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } } });
      await tx.alertApproval.create({ data: { alertId: id, approverId: u.id, decision: 'PUBLISHED' } });
      await tx.notificationDeliveryLog.create({ data: { alertId: id, channel: 'IN_APP', status: 'SENT', provider: 'internal' } });
      await this.audit.log(u, { action: 'alerts.publish', entityType: 'alert', entityId: id, after: { channels } }, tx);
      await this.outbox.emit(tx, 'alert.published', { id, ref: a.ref, title: a.title, severity: a.severity, targetLgaIds: a.targetLgaIds });
      await this.notify.toPermission(tx, 'alerts.read', { type: 'alert.published', title: `Alert published: ${a.title}`, body: a.message.slice(0, 140), entityType: 'alert', entityId: id }); return upd;
    });
    await this.jobs.enqueueDelivery({ alertId: id, channels }); // queued on BullMQ; SMS/Email/Push are logged NOT_CONFIGURED unless a provider is enabled
    return upd;
  }
  @Post('alerts/:id/cancel') @Perm('alerts.publish')
  async cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(300) }))) b: { reason: string }) {
    const a = await this.loadA(id); if (['EXPIRED', 'CANCELLED'].includes(a.status)) throw new DomainError('INVALID_TRANSITION', `Alert is ${a.status}`);
    return this.prisma.$transaction(async tx => {
      const upd = await tx.publicAlert.update({ where: { id }, data: { status: 'CANCELLED', version: { increment: 1 } } });
      await tx.alertApproval.create({ data: { alertId: id, approverId: u.id, decision: 'CANCELLED', comment: b.reason } });
      await this.audit.log(u, { action: 'alerts.cancel', entityType: 'alert', entityId: id, before: { status: a.status }, reason: b.reason }, tx); return upd;
    });
  }
}
