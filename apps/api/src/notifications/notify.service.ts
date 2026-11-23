import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';

export interface NotifyInput { type: string; title: string; body: string; entityType?: string; entityId?: string; lgaId?: string | null }

@Injectable()
export class NotifyService {
  private log = new Logger('Notify');
  constructor(private prisma: PrismaService) {}

  /** In-app notification to every active user holding `permission` (and within LGA scope when the user is scoped). */
  async toPermission(tx: Tx | PrismaService, permission: string, n: NotifyInput, excludeUserId?: string) {
    const db = tx as PrismaService;
    const users = await db.user.findMany({
      where: { isActive: true, id: excludeUserId ? { not: excludeUserId } : undefined,
        roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } } },
      select: { id: true, scopes: { select: { lgaId: true } }, roles: { select: { role: { select: { scopeRequired: true } } } } },
    });
    const rows = users.filter(u => {
      const scoped = u.scopes.length > 0 || u.roles.some(r => r.role.scopeRequired);
      return !scoped || !n.lgaId || u.scopes.some(s => s.lgaId === n.lgaId);
    }).map(u => ({ userId: u.id, type: n.type, title: n.title, body: n.body, entityType: n.entityType, entityId: n.entityId }));
    if (rows.length) await db.notification.createMany({ data: rows });
    return rows.length;
  }
  async toUser(tx: Tx | PrismaService, userId: string, n: NotifyInput) {
    await (tx as PrismaService).notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, entityType: n.entityType, entityId: n.entityId } });
  }

  /** External channel delivery. No provider credentials → recorded honestly as NOT_CONFIGURED; nothing is sent. */
  async deliverExternal(alertId: string, channels: Array<'SMS' | 'EMAIL' | 'PUSH'>) {
    const cfgs = await this.prisma.integrationConfig.findMany({ where: { key: { in: ['sms', 'email', 'push'] } } });
    for (const ch of channels) {
      const cfg = cfgs.find(c => c.key === ch.toLowerCase());
      const configured = !!(cfg?.enabled && cfg.status === 'CONFIGURED');
      await this.prisma.notificationDeliveryLog.create({ data: { alertId, channel: ch, status: configured ? 'QUEUED' : 'NOT_CONFIGURED', provider: cfg?.key, error: configured ? undefined : 'No provider credentials configured' } });
      if (!configured) this.log.warn(`${ch} delivery for alert ${alertId} skipped: NOT_CONFIGURED`);
    }
  }
}
