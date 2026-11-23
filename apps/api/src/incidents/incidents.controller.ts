import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { IncidentsService } from './incidents.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery } from '../common/pagination';
import { StorageService } from '../common/storage.service';
import { PrismaService } from '../common/prisma.service';
import { assertInScope } from '../common/scope';
import { AuditService } from '../common/audit.service';

const sev = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
const createS = z.object({ title: z.string().trim().min(5).max(160), description: z.string().trim().min(10).max(4000), categoryId: z.string().uuid(), severity: sev,
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), lgaId: z.string().uuid(), ward: z.string().max(100).optional(), community: z.string().max(100).optional(),
  address: z.string().max(300).optional(), estAffected: z.number().int().min(0).max(10_000_000).optional(), reportIds: z.array(z.string().uuid()).optional(),
  ownerId: z.string().uuid().optional(), coordinatorId: z.string().uuid().optional() });
const patchS = z.object({ title: z.string().trim().min(5).max(160).optional(), description: z.string().trim().min(10).max(4000).optional(), ward: z.string().max(100).nullable().optional(),
  community: z.string().max(100).nullable().optional(), address: z.string().max(300).nullable().optional(), estAffected: z.number().int().min(0).nullable().optional(), verifiedAffected: z.number().int().min(0).nullable().optional(),
  status: z.enum(['OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY']).optional(), statusReason: z.string().max(300).optional(), version: z.number().int().optional() });
const updS = z.object({ type: z.enum(['UPDATE', 'DECISION', 'NOTE']).default('UPDATE'), body: z.string().trim().min(3).max(4000) });
const assignS = z.object({ ownerId: z.string().uuid().nullable().optional(), coordinatorId: z.string().uuid().nullable().optional(), reason: z.string().max(300).optional(), version: z.number().int().optional() });
const sevS = z.object({ severity: sev, reason: z.string().trim().min(5, 'A reason is required').max(500), version: z.number().int().optional() });
const resolveS = z.object({ resolutionSummary: z.string().trim().min(10, 'Resolution summary is required').max(4000), version: z.number().int().optional() });
const reopenS = z.object({ reason: z.string().trim().min(5, 'A reason is required').max(500), version: z.number().int().optional() });

@Controller('incidents')
export class IncidentsController {
  constructor(private svc: IncidentsService, private storage: StorageService, private prisma: PrismaService, private audit: AuditService) {}
  @Get() @Perm('incidents.read') list(@CurrentUser() u: AuthUser, @Query() raw: any) { return this.svc.list(u, { ...raw, ...pageQuery.parse(raw) }); }
  @Post() @Perm('incidents.create') create(@CurrentUser() u: AuthUser, @Body(body(createS)) b: z.infer<typeof createS>) { return this.svc.create(u, b); }
  @Get(':id') @Perm('incidents.read') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') @Perm('incidents.update') patch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchS)) b: any) { return this.svc.patch(u, id, b); }
  @Post(':id/updates') @Perm('incidents.update') upd(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(updS)) b: z.infer<typeof updS>) { return this.svc.addUpdate(u, id, b.type, b.body); }
  @Post(':id/assign-owner') @Perm('incidents.assign') assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(assignS)) b: any) { return this.svc.assign(u, id, b); }
  @Post(':id/change-severity') @Perm('incidents.severity') sev(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(sevS)) b: z.infer<typeof sevS>) { return this.svc.changeSeverity(u, id, b.severity, b.reason, b.version); }
  @Post(':id/link-report') @Perm('incidents.update') link(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reportId: z.string().uuid() }))) b: { reportId: string }) { return this.svc.linkReport(u, id, b.reportId); }
  @Post(':id/resolve') @Perm('incidents.resolve') resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(resolveS)) b: z.infer<typeof resolveS>) { return this.svc.resolve(u, id, b.resolutionSummary, b.version); }
  @Post(':id/close') @Perm('incidents.close') close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ version: z.number().int().optional() }))) b: { version?: number }) { return this.svc.close(u, id, b.version); }
  @Post(':id/reopen') @Perm('incidents.reopen') reopen(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(reopenS)) b: z.infer<typeof reopenS>) { return this.svc.reopen(u, id, b.reason, b.version); }

  @Post(':id/media') @Perm('incidents.update') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async media(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: any) {
    const inc = await this.prisma.incident.findUniqueOrThrow({ where: { id } }); assertInScope(u, inc.lgaId);
    const saved = this.storage.save(file);
    const m = await this.prisma.incidentMedia.create({ data: { incidentId: id, storageKey: saved.key, mime: saved.mime, size: saved.size, uploadedById: u.id } });
    await this.audit.log(u, { action: 'incidents.attach_evidence', entityType: 'incident', entityId: id, after: { key: saved.key, mime: saved.mime } });
    return m;
  }
}
