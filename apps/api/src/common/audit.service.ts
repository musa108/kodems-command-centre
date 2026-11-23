import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from './prisma.service';
import { AuthUser } from './auth.types';

export interface AuditEntry { action: string; entityType: string; entityId?: string; before?: any; after?: any; reason?: string }

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  /** Pass `tx` to write the audit row in the same transaction as the change. */
  async log(u: Pick<AuthUser, 'id' | 'ip' | 'userAgent'> | null, e: AuditEntry, tx?: Tx) {
    const db = (tx ?? this.prisma) as PrismaService;
    return db.auditLog.create({ data: {
      userId: u?.id, action: e.action, entityType: e.entityType, entityId: e.entityId,
      before: e.before === undefined ? undefined : JSON.parse(JSON.stringify(e.before)),
      after: e.after === undefined ? undefined : JSON.parse(JSON.stringify(e.after)),
      reason: e.reason, ip: u?.ip, userAgent: u?.userAgent?.slice(0, 200),
    } });
  }
}
