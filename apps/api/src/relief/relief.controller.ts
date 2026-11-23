import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReliefService } from './relief.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { assertInScope } from '../common/scope';

const uuid = z.string().uuid(); const qty = z.number().int().positive().max(10_000_000);
const itemS = z.object({ name: z.string().trim().min(2).max(120), sku: z.string().trim().min(2).max(40).toUpperCase(), categoryId: uuid, unit: z.string().min(1).max(20) });
const whS = z.object({ name: z.string().trim().min(3).max(120), code: z.string().trim().min(2).max(20).toUpperCase(), lgaId: uuid, lat: z.number().optional(), lng: z.number().optional(), contactPerson: z.string().optional(), contactPhone: z.string().optional(), capacity: z.string().optional() });
const txS = z.object({ warehouseId: uuid, itemId: uuid, type: z.enum(['RECEIPT', 'DONATION', 'PROCUREMENT', 'TRANSFER_OUT', 'DAMAGED', 'EXPIRED', 'ADJUSTMENT']), quantity: z.number().int().refine(n => n !== 0, 'Non-zero').refine(n => Math.abs(n) <= 10_000_000),
  reference: z.string().max(100).optional(), reason: z.string().max(300).optional(), toWarehouseId: uuid.optional(), idempotencyKey: z.string().max(100).optional() });
const recS = z.object({ warehouseId: uuid, itemId: uuid, countedQuantity: z.number().int().min(0), reason: z.string().trim().min(3).max(300) });
const allocS = z.object({ incidentId: uuid, warehouseId: uuid, targetArea: z.string().trim().min(3).max(300), items: z.array(z.object({ itemId: uuid, quantity: qty })).min(1), submit: z.boolean().optional() });
const noteS = z.object({ note: z.string().trim().min(3).max(500).optional() });
const distS = z.object({ allocationId: uuid, beneficiaryId: uuid.optional(), householdId: uuid.optional(), beneficiaryName: z.string().trim().min(2).max(120).optional(), phone: z.string().max(30).optional(),
  items: z.array(z.object({ itemId: uuid, quantity: qty })).min(1), acknowledgement: z.string().max(300).optional() });

@Controller('relief')
export class ReliefController {
  constructor(private svc: ReliefService, private prisma: PrismaService, private audit: AuditService) {}
  @Get('items') @Perm('relief.inventory.read') items() { return this.svc.items(); }
  @Post('items') @Perm('relief.inventory.manage') async newItem(@CurrentUser() u: AuthUser, @Body(body(itemS)) b: z.infer<typeof itemS>) { const i = await this.prisma.reliefItem.create({ data: b }); await this.audit.log(u, { action: 'relief.item_create', entityType: 'relief_item', entityId: i.id, after: b }); return i; }
  @Get('warehouses') @Perm('relief.inventory.read') warehouses(@CurrentUser() u: AuthUser) { return this.svc.warehouses(u); }
  @Post('warehouses') @Perm('relief.inventory.manage') async newWh(@CurrentUser() u: AuthUser, @Body(body(whS)) b: z.infer<typeof whS>) { assertInScope(u, b.lgaId); const w = await this.prisma.warehouse.create({ data: b }); await this.audit.log(u, { action: 'relief.warehouse_create', entityType: 'warehouse', entityId: w.id, after: b }); return w; }
  @Get('inventory') @Perm('relief.inventory.read') inv(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.inventory(u, q); }
  @Get('transactions') @Perm('relief.inventory.read') txs(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.transactions(u, { ...q, ...pageQuery.parse(q) }); }
  @Post('transactions') @Perm('relief.inventory.manage') rec(@CurrentUser() u: AuthUser, @Body(body(txS)) b: z.infer<typeof txS>, @Headers('idempotency-key') k?: string) { return this.svc.record(u, { ...b, idempotencyKey: b.idempotencyKey ?? k }); }
  @Post('reconcile') @Perm('relief.inventory.manage') rc(@CurrentUser() u: AuthUser, @Body(body(recS)) b: z.infer<typeof recS>) { return this.svc.reconcile(u, b); }
  @Get('allocations') @Perm('relief.allocations.read') al(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.allocations(u, { ...q, ...pageQuery.parse(q) }); }
  @Post('allocations') @Perm('relief.allocations.create') alc(@CurrentUser() u: AuthUser, @Body(body(allocS)) b: z.infer<typeof allocS>) { return this.svc.createAllocation(u, b); }
  @Post('allocations/:id/submit') @Perm('relief.allocations.create') sub(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.submitAllocation(u, id); }
  @Post('allocations/:id/approve') @Perm('relief.allocations.approve') ap(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(noteS)) b: { note?: string }) { return this.svc.approve(u, id, b.note); }
  @Post('allocations/:id/reject') @Perm('relief.allocations.approve') rj(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(3).max(500) }))) b: { note: string }) { return this.svc.reject(u, id, b.note); }
  @Post('allocations/:id/cancel') @Perm('relief.allocations.create') cn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(3).max(500) }))) b: { note: string }) { return this.svc.reject(u, id, b.note, true); }
  @Get('distributions') @Perm('relief.distributions.read') ds(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.distributions(u, { ...q, ...pageQuery.parse(q) }); }
  @Post('distributions') @Perm('relief.distributions.record') dist(@CurrentUser() u: AuthUser, @Body(body(distS)) b: z.infer<typeof distS>, @Headers('idempotency-key') k?: string) { return this.svc.distribute(u, { ...b, idempotencyKey: k }); }
}
