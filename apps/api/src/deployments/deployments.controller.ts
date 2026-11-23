import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { DeploymentsService } from './deployments.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery } from '../common/pagination';

const sev = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
const createS = z.object({ incidentId: z.string().uuid(), teamId: z.string().uuid(), destination: z.string().trim().min(3).max(300), priority: sev.optional(), instructions: z.string().max(2000).optional(), requiredResources: z.string().max(1000).optional() });
const patchS = z.object({ instructions: z.string().max(2000).optional(), priority: sev.optional(), requiredResources: z.string().max(1000).optional(),
  status: z.enum(['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'CANCELLED']).optional(), reason: z.string().max(500).optional(), version: z.number().int().optional() });
const updS = z.object({ kind: z.enum(['FIELD_UPDATE', 'CHALLENGE', 'RESOURCE_REQUEST', 'INSTRUCTION', 'ESCALATION']), message: z.string().trim().min(3).max(2000), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() });
const reassignS = z.object({ teamId: z.string().uuid(), reason: z.string().trim().min(5, 'A reason is required').max(500) });
const completeS = z.object({ completionReport: z.string().trim().min(10, 'A completion report is required').max(4000), version: z.number().int().optional() });

@Controller('deployments')
export class DeploymentsController {
  constructor(private svc: DeploymentsService) {}
  @Get() @Perm('deployments.read') list(@CurrentUser() u: AuthUser, @Query() raw: any) { return this.svc.list(u, { ...raw, ...pageQuery.parse(raw) }); }
  @Post() @Perm('deployments.assign') create(@CurrentUser() u: AuthUser, @Body(body(createS)) b: z.infer<typeof createS>) { return this.svc.create(u, b); }
  @Get(':id') @Perm('deployments.read') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') @Perm('deployments.update') patch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchS)) b: any) { return this.svc.patch(u, id, b); }
  @Post(':id/reassign') @Perm('deployments.assign', 'deployments.update') reassign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(reassignS)) b: z.infer<typeof reassignS>) { return this.svc.reassign(u, id, b); }
  @Post(':id/updates') @Perm('deployments.update') upd(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(updS)) b: z.infer<typeof updS>, @Headers('idempotency-key') k?: string) { return this.svc.addUpdate(u, id, b, k); }
  @Post(':id/complete') @Perm('deployments.update') complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(completeS)) b: z.infer<typeof completeS>) { return this.svc.advance(u, id, 'COMPLETED', { completionReport: b.completionReport, version: b.version }); }
}
