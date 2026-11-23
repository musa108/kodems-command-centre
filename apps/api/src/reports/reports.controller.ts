import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ReportsService } from './reports.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery } from '../common/pagination';
import { StorageService } from '../common/storage.service';
import { PrismaService } from '../common/prisma.service';
import { assertInScope } from '../common/scope';

const sev = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
const createS = z.object({ categoryId: z.string().uuid(), description: z.string().trim().min(10).max(4000), reporterName: z.string().max(120).optional(), reporterPhone: z.string().max(30).optional(),
  incidentAt: z.string().datetime({ offset: true }), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), lgaId: z.string().uuid(), ward: z.string().max(100).optional(),
  community: z.string().max(100).optional(), address: z.string().max(300).optional(), estAffected: z.number().int().min(0).optional(), immediateNeeds: z.string().max(500).optional(), suggestedSeverity: sev.default('MODERATE') });
const incData = z.object({ title: z.string().trim().min(5).max(160), description: z.string().trim().min(10).max(4000), categoryId: z.string().uuid(), severity: sev,
  estAffected: z.number().int().min(0).optional(), ownerId: z.string().uuid().optional(), coordinatorId: z.string().uuid().optional(), lgaId: z.string().uuid().optional(), lat: z.number().optional(), lng: z.number().optional() });
const verifyS = z.object({ version: z.number().int().optional(), note: z.string().max(1000).optional(),
  incident: z.discriminatedUnion('mode', [z.object({ mode: z.literal('none') }), z.object({ mode: z.literal('link'), incidentId: z.string().uuid() }), z.object({ mode: z.literal('create'), data: incData })]) });
const rejectS = z.object({ reason: z.string().trim().min(5, 'A rejection reason is mandatory').max(1000), version: z.number().int().optional() });
const dupS = z.object({ originalId: z.string().uuid(), version: z.number().int().optional() });

@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService, private storage: StorageService, private prisma: PrismaService) {}
  @Get() @Perm('reports.read') list(@CurrentUser() u: AuthUser, @Query() raw: any) { return this.svc.list(u, { ...raw, ...pageQuery.parse(raw) }); }
  @Post() @Perm('reports.create') create(@CurrentUser() u: AuthUser, @Body(body(createS)) b: any, @Headers('idempotency-key') k?: string) { return this.svc.create(u, b, k); }
  @Get(':id') @Perm('reports.read') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Get(':id/history') @Perm('reports.read') async history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return { data: (await this.svc.get(u, id)).history }; }
  @Post(':id/assign') @Perm('reports.assign') assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ officerId: z.string().uuid() }))) b: { officerId: string }) { return this.svc.assign(u, id, b.officerId); }
  @Post(':id/verify') @Perm('incidents.verify') verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(verifyS)) b: any) { return this.svc.verify(u, id, b); }
  @Post(':id/reject') @Perm('incidents.reject') reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(rejectS)) b: z.infer<typeof rejectS>) { return this.svc.reject(u, id, b.reason, b.version); }
  @Post(':id/mark-duplicate') @Perm('reports.duplicate') dup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(dupS)) b: z.infer<typeof dupS>) { return this.svc.markDuplicate(u, id, b.originalId, b.version); }
  @Post(':id/notes') @Perm('reports.note') note(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ body: z.string().trim().min(2).max(2000) }))) b: { body: string }) { return this.svc.addNote(u, id, b.body); }
  @Post(':id/escalate') @Perm('incidents.verify') esc(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) { return this.svc.escalate(u, id, b.reason); }

  @Post(':id/media') @Perm('reports.create') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async media(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: any) {
    const r = await this.prisma.incidentReport.findUniqueOrThrow({ where: { id } }); assertInScope(u, r.lgaId);
    const s = this.storage.save(file);
    return this.prisma.reportMedia.create({ data: { reportId: id, storageKey: s.key, mime: s.mime, size: s.size } });
  }
}
