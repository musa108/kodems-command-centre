import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { NotifyService } from '../notifications/notify.service';

type DeliveryJob = { alertId: string; channels: Array<'SMS' | 'EMAIL' | 'PUSH'> };
const QUEUE = 'alert-delivery';

/** Background jobs on Redis + BullMQ. External alert delivery is queued (retries with backoff) so a slow/failed provider never blocks publication.
 *  Set JOBS_INLINE=true to bypass the queue (used by most tests). If Redis is unreachable the job runs inline and the fallback is logged. */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Jobs'); private queue?: Queue; private worker?: Worker;
  constructor(private notify: NotifyService) {}
  private get inline() { return process.env.JOBS_INLINE === 'true'; }
  private connection() { const u = new URL(process.env.REDIS_URL || 'redis://localhost:6379'); return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null as any }; }
  onModuleInit() {
    if (this.inline) return;
    try {
      this.queue = new Queue(QUEUE, { connection: this.connection(), defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
      this.worker = new Worker<DeliveryJob>(QUEUE, async j => { await this.notify.deliverExternal(j.data.alertId, j.data.channels); }, { connection: this.connection() });
      this.queue.on('error', e => this.log.warn(`queue error: ${e.message}`)); this.worker.on('error', e => this.log.warn(`worker error: ${e.message}`)); this.worker.on('failed', (j, e) => this.log.error(`job ${j?.id} failed: ${e.message}`));
    } catch (e: any) { this.log.warn(`BullMQ unavailable, running jobs inline: ${e.message}`); }
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue?.close(); }
  async enqueueDelivery(job: DeliveryJob) {
    if (!this.queue) return this.notify.deliverExternal(job.alertId, job.channels);
    try { await this.queue.add('deliver', job, { jobId: `deliver-${job.alertId}` }); } catch (e: any) { this.log.warn(`enqueue failed (${e.message}); delivering inline`); await this.notify.deliverExternal(job.alertId, job.channels); }
  }
}
