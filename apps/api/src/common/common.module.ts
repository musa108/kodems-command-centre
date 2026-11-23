import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { OutboxService } from './outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { JobsService } from './jobs.service';

@Global()
@Module({ providers: [PrismaService, AuditService, OutboxService, NotifyService, JobsService], exports: [PrismaService, AuditService, OutboxService, NotifyService, JobsService] })
export class CommonModule {}
