import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from './prisma.service';
import { EventEmitter } from 'events';

/** Transactional outbox: `emit` writes in the caller's transaction; a relay publishes committed events to Socket.IO. */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Outbox');
  readonly bus = new EventEmitter();
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private prisma: PrismaService) {}

  async emit(tx: Tx | PrismaService, type: string, payload: Record<string, any>, scopeLgaId?: string | null) {
    await (tx as PrismaService).outboxEvent.create({ data: { type, payload, scopeLgaId: scopeLgaId ?? null } });
  }
  onModuleInit() { if (process.env.NODE_ENV !== 'test') this.timer = setInterval(() => void this.flush(), 1000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async flush() {
    if (this.running) return; this.running = true;
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows: any[] = await tx.$queryRaw`SELECT id, type, payload, "scopeLgaId" FROM outbox_events WHERE "publishedAt" IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`;
        for (const r of rows) {
          this.bus.emit('event', { id: Number(r.id), type: r.type, payload: r.payload, scopeLgaId: r.scopeLgaId });
          await tx.outboxEvent.update({ where: { id: r.id }, data: { publishedAt: new Date() } });
        }
      });
    } catch (e: any) { this.log.warn(`flush failed: ${e.message}`); } finally { this.running = false; }
  }
}
