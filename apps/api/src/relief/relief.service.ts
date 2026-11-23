import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutboxService } from '../common/outbox.service';
import { NotifyService } from '../notifications/notify.service';
import { AuthUser } from '../common/auth.types';
import { DomainError } from '../common/errors';
import { assertInScope, scopeWhere } from '../common/scope';
import { hasStock, signedDelta } from '../common/state';
import { nextRef } from '../common/refs';
import { paged } from '../common/pagination';

const LOW_STOCK = 20;

@Injectable()
export class ReliefService {
  constructor(private prisma: PrismaService, private audit: AuditService, private outbox: OutboxService, private notify: NotifyService) {}

  /** Serialise concurrent movements of the same (warehouse,item) for the life of the transaction. */
  private async lock(tx: Tx, warehouseId: string, itemId: string) {
    await (tx as PrismaService).$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${warehouseId + ':' + itemId}, 0))`;
  }
  async balance(tx: Tx | PrismaService, warehouseId: string, itemId: string): Promise<number> {
    const r: any[] = await (tx as PrismaService).$queryRaw`SELECT COALESCE(SUM(delta),0)::int AS b FROM inventory_transactions WHERE "warehouseId"=${warehouseId}::uuid AND "itemId"=${itemId}::uuid`;
    return r[0].b;
  }
  /** Quantity promised to approved, not-yet-distributed allocations from this warehouse for this item. */
  private async committed(tx: Tx, warehouseId: string, itemId: string, excludeAllocation?: string): Promise<number> {
    const r: any[] = await (tx as PrismaService).$queryRaw`
      SELECT COALESCE(SUM(ai.quantity - COALESCE((SELECT SUM(di.quantity) FROM distribution_items di JOIN relief_distributions rd ON rd.id = di."distributionId" WHERE rd."allocationId" = a.id AND di."itemId" = ai."itemId"),0)),0)::int AS c
      FROM relief_allocations a JOIN allocation_items ai ON ai."allocationId" = a.id
      WHERE a.status = 'APPROVED' AND a."warehouseId" = ${warehouseId}::uuid AND ai."itemId" = ${itemId}::uuid AND (${excludeAllocation ?? null}::uuid IS NULL OR a.id <> ${excludeAllocation ?? null}::uuid)`;
    return r[0].c;
  }
  private async wh(u: AuthUser, id: string) {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Warehouse not found' });
    assertInScope(u, w.lgaId); return w;
  }

  // ── Inventory ──
  async inventory(u: AuthUser, q: any) {
    const wh = await this.prisma.warehouse.findMany({ where: { ...scopeWhere(u), ...(q.warehouseId ? { id: q.warehouseId } : {}) }, select: { id: true, name: true, code: true } });
    const rows: any[] = await this.prisma.$queryRaw`SELECT "warehouseId", "itemId", SUM(delta)::int AS balance, MAX("createdAt") AS "lastMovement" FROM inventory_transactions GROUP BY 1,2`;
    const items = await this.prisma.reliefItem.findMany({ include: { category: true } });
    const wn = Object.fromEntries(wh.map(w => [w.id, w])); const im = Object.fromEntries(items.map(i => [i.id, i]));
    const data = rows.filter(r => wn[r.warehouseId] && im[r.itemId]).map(r => ({ warehouseId: r.warehouseId, warehouse: wn[r.warehouseId].name, itemId: r.itemId, item: im[r.itemId].name, sku: im[r.itemId].sku, unit: im[r.itemId].unit,
      category: im[r.itemId].category.label, balance: r.balance, lowStock: r.balance < LOW_STOCK, lastMovement: r.lastMovement }))
      .filter(r => !q.itemId || r.itemId === q.itemId).sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.item.localeCompare(b.item));
    return { data, asOf: new Date().toISOString(), lowStockThreshold: LOW_STOCK };
  }
  async transactions(u: AuthUser, q: any) {
    const where: any = { warehouse: { ...scopeWhere(u) } };
    if (q.warehouseId) where.warehouseId = q.warehouseId; if (q.itemId) where.itemId = q.itemId; if (q.type) where.type = q.type;
    const [rows, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { warehouse: { select: { name: true } }, item: { select: { name: true, unit: true } } } }),
      this.prisma.inventoryTransaction.count({ where })]);
    return paged(rows.map(t => ({ id: t.id, type: t.type, delta: t.delta, warehouse: t.warehouse.name, item: t.item.name, unit: t.item.unit, reference: t.reference, reason: t.reason, createdAt: t.createdAt })), total, q.page, q.pageSize);
  }

  /** Append-only stock movement. Stock is NEVER overwritten; every change is a ledger row written in a locked transaction. */
  async record(u: AuthUser, b: { warehouseId: string; itemId: string; type: string; quantity: number; reference?: string; reason?: string; toWarehouseId?: string; idempotencyKey?: string }) {
    const w = await this.wh(u, b.warehouseId);
    if (b.idempotencyKey) { const ex = await this.prisma.inventoryTransaction.findUnique({ where: { idempotencyKey: b.idempotencyKey } }); if (ex) return ex; }
    if (b.type === 'DISTRIBUTION') throw new DomainError('USE_DISTRIBUTION', 'Distributions must be recorded against an approved allocation');
    if (['DAMAGED', 'EXPIRED', 'ADJUSTMENT'].includes(b.type) && !b.reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required' });
    const isTransfer = b.type === 'TRANSFER_OUT';
    if (isTransfer) { if (!b.toWarehouseId) throw new BadRequestException({ code: 'DESTINATION_REQUIRED', message: 'Destination warehouse required' }); if (b.toWarehouseId === b.warehouseId) throw new DomainError('SAME_WAREHOUSE', 'Choose a different warehouse'); await this.wh(u, b.toWarehouseId); }
    const delta = signedDelta(b.type, b.quantity);
    if (delta === 0) throw new BadRequestException({ code: 'ZERO_QUANTITY', message: 'Quantity must be non-zero' });
    return this.prisma.$transaction(async tx => {
      const keys = isTransfer ? [b.warehouseId, b.toWarehouseId!].sort() : [b.warehouseId];
      for (const k of keys) await this.lock(tx, k, b.itemId);
      if (delta < 0) {
        const bal = await this.balance(tx, b.warehouseId, b.itemId);
        const com = await this.committed(tx, b.warehouseId, b.itemId);
        if (!hasStock(bal - com, -delta)) throw new DomainError('INSUFFICIENT_STOCK', `Only ${Math.max(0, bal - com)} available (${bal} on hand, ${com} committed to approved allocations)`, 409);
      }
      const group = isTransfer ? (await tx.$queryRaw<any[]>`SELECT gen_random_uuid() AS g`)[0].g : undefined;
      const t = await tx.inventoryTransaction.create({ data: { warehouseId: b.warehouseId, itemId: b.itemId, type: b.type as any, delta, reference: b.reference, reason: b.reason, createdById: u.id, idempotencyKey: b.idempotencyKey, transferGroup: group } });
      if (isTransfer) await tx.inventoryTransaction.create({ data: { warehouseId: b.toWarehouseId!, itemId: b.itemId, type: 'TRANSFER_IN', delta: Math.abs(delta), reference: b.reference, reason: b.reason, createdById: u.id, transferGroup: group } });
      await this.audit.log(u, { action: `relief.stock_${b.type.toLowerCase()}`, entityType: 'inventory', entityId: t.id, after: { warehouse: w.code, itemId: b.itemId, delta, reason: b.reason } }, tx);
      if (delta < 0) {
        const bal = await this.balance(tx, b.warehouseId, b.itemId);
        if (bal < LOW_STOCK) await this.notify.toPermission(tx, 'relief.inventory.read', { type: 'inventory.shortage', title: `Low stock at ${w.name}`, body: `Balance ${bal}`, entityType: 'warehouse', entityId: w.id, lgaId: w.lgaId }, u.id);
      }
      return t;
    });
  }

  async reconcile(u: AuthUser, b: { warehouseId: string; itemId: string; countedQuantity: number; reason: string }) {
    await this.wh(u, b.warehouseId);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, b.warehouseId, b.itemId);
      const bal = await this.balance(tx, b.warehouseId, b.itemId);
      const diff = b.countedQuantity - bal;
      if (diff === 0) return { balanceBefore: bal, adjustment: 0, message: 'Count matches ledger' };
      const t = await tx.inventoryTransaction.create({ data: { warehouseId: b.warehouseId, itemId: b.itemId, type: 'ADJUSTMENT', delta: diff, reason: `Stock count: ${b.reason}`, createdById: u.id } });
      await this.audit.log(u, { action: 'relief.reconcile', entityType: 'inventory', entityId: t.id, before: { balance: bal }, after: { balance: b.countedQuantity }, reason: b.reason }, tx);
      return { balanceBefore: bal, adjustment: diff, transactionId: t.id };
    });
  }

  // ── Allocations ──
  async createAllocation(u: AuthUser, b: { incidentId: string; warehouseId: string; targetArea: string; items: Array<{ itemId: string; quantity: number }>; submit?: boolean }) {
    const inc = await this.prisma.incident.findUnique({ where: { id: b.incidentId } });
    if (!inc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' }); assertInScope(u, inc.lgaId);
    if (['CLOSED'].includes(inc.status)) throw new DomainError('INCIDENT_LOCKED', 'Incident is closed');
    await this.wh(u, b.warehouseId);
    const ids = b.items.map(i => i.itemId); if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: 'DUPLICATE_ITEM', message: 'Each item may appear once' });
    return this.prisma.$transaction(async tx => {
      const ref = await nextRef(tx, 'ALC');
      const a = await tx.reliefAllocation.create({ data: { ref, incidentId: b.incidentId, warehouseId: b.warehouseId, targetArea: b.targetArea, requestedById: u.id, status: b.submit ? 'PENDING_APPROVAL' : 'DRAFT', isDemo: inc.isDemo, items: { create: b.items } } });
      await this.audit.log(u, { action: 'relief.allocation_create', entityType: 'allocation', entityId: a.id, after: { ref, items: b.items, status: a.status } }, tx);
      if (b.submit) await this.notify.toPermission(tx, 'relief.allocations.approve', { type: 'allocation.pending', title: `Allocation ${ref} awaits approval`, body: b.targetArea, entityType: 'allocation', entityId: a.id, lgaId: inc.lgaId }, u.id);
      return a;
    });
  }
  async submitAllocation(u: AuthUser, id: string) {
    const a = await this.loadAlloc(u, id);
    if (a.status !== 'DRAFT') throw new DomainError('INVALID_TRANSITION', 'Only draft allocations can be submitted');
    return this.prisma.$transaction(async tx => {
      const upd = await tx.reliefAllocation.update({ where: { id }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } } });
      await this.audit.log(u, { action: 'relief.allocation_submit', entityType: 'allocation', entityId: id }, tx);
      await this.notify.toPermission(tx, 'relief.allocations.approve', { type: 'allocation.pending', title: `Allocation ${a.ref} awaits approval`, body: a.targetArea, entityType: 'allocation', entityId: id, lgaId: a.incident.lgaId }, u.id);
      return upd;
    });
  }
  private async loadAlloc(u: AuthUser, id: string) {
    const a = await this.prisma.reliefAllocation.findUnique({ where: { id }, include: { items: true, incident: { select: { lgaId: true, ref: true } } } });
    if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Allocation not found' });
    assertInScope(u, a.incident.lgaId); return a;
  }
  /** Approval re-checks stock under lock and enforces segregation of duties (requester cannot approve). */
  async approve(u: AuthUser, id: string, note?: string) {
    const a = await this.loadAlloc(u, id);
    if (a.status !== 'PENDING_APPROVAL') throw new DomainError('INVALID_TRANSITION', `Allocation is ${a.status}`);
    if (a.requestedById === u.id) throw new DomainError('SEGREGATION_OF_DUTIES', 'You cannot approve an allocation you requested', 403);
    return this.prisma.$transaction(async tx => {
      for (const it of [...a.items].sort((x, y) => x.itemId.localeCompare(y.itemId))) {
        await this.lock(tx, a.warehouseId, it.itemId);
        const bal = await this.balance(tx, a.warehouseId, it.itemId);
        const com = await this.committed(tx, a.warehouseId, it.itemId, id);
        if (bal - com < it.quantity) throw new DomainError('INSUFFICIENT_STOCK', `Insufficient stock for approval: ${Math.max(0, bal - com)} available, ${it.quantity} requested`, 409);
      }
      const upd = await tx.reliefAllocation.update({ where: { id }, data: { status: 'APPROVED', approvedById: u.id, approvedAt: new Date(), decisionNote: note, version: { increment: 1 } } });
      await this.audit.log(u, { action: 'relief.allocation_approve', entityType: 'allocation', entityId: id, before: { status: a.status }, after: { status: 'APPROVED' }, reason: note }, tx);
      await this.outbox.emit(tx, 'relief.allocation_approved', { id, ref: a.ref, incidentId: a.incidentId }, a.incident.lgaId);
      await this.notify.toUser(tx, a.requestedById, { type: 'allocation.approved', title: `Allocation ${a.ref} approved`, body: a.targetArea, entityType: 'allocation', entityId: id });
      return upd;
    });
  }
  async reject(u: AuthUser, id: string, note: string, cancel = false) {
    const a = await this.loadAlloc(u, id);
    if (!['PENDING_APPROVAL', ...(cancel ? ['DRAFT', 'APPROVED'] : [])].includes(a.status)) throw new DomainError('INVALID_TRANSITION', `Allocation is ${a.status}`);
    const to = cancel ? 'CANCELLED' : 'REJECTED';
    return this.prisma.$transaction(async tx => {
      const upd = await tx.reliefAllocation.update({ where: { id }, data: { status: to, decisionNote: note, approvedById: cancel ? undefined : u.id, version: { increment: 1 } } });
      await this.audit.log(u, { action: `relief.allocation_${to.toLowerCase()}`, entityType: 'allocation', entityId: id, before: { status: a.status }, after: { status: to }, reason: note }, tx);
      return upd;
    });
  }
  async allocations(u: AuthUser, q: any) {
    const where: any = { incident: { ...scopeWhere(u) } };
    if (q.status) where.status = { in: q.status.split(',') }; if (q.incidentId) where.incidentId = q.incidentId; if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }, { targetArea: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      this.prisma.reliefAllocation.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { incident: { select: { ref: true, title: true } }, warehouse: { select: { name: true } }, items: { include: { item: { select: { name: true, unit: true } } } } } }),
      this.prisma.reliefAllocation.count({ where })]);
    const dist: any[] = rows.length ? await this.prisma.$queryRaw`SELECT rd."allocationId" AS aid, di."itemId" AS iid, SUM(di.quantity)::int AS q FROM distribution_items di JOIN relief_distributions rd ON rd.id = di."distributionId" WHERE rd."allocationId" = ANY(${rows.map(r => r.id)}::uuid[]) GROUP BY 1,2` : [];
    return paged(rows.map(a => ({ id: a.id, ref: a.ref, status: a.status, targetArea: a.targetArea, incident: a.incident, warehouse: a.warehouse.name, requestedById: a.requestedById, approvedById: a.approvedById, createdAt: a.createdAt, version: a.version, isDemo: a.isDemo,
      items: a.items.map(i => ({ itemId: i.itemId, name: i.item.name, unit: i.item.unit, quantity: i.quantity, distributed: dist.find(d => d.aid === a.id && d.iid === i.itemId)?.q ?? 0 })) })), total, q.page, q.pageSize);
  }

  // ── Distributions ──
  async distribute(u: AuthUser, b: { allocationId: string; beneficiaryId?: string; householdId?: string; beneficiaryName?: string; phone?: string; items: Array<{ itemId: string; quantity: number }>; acknowledgement?: string; idempotencyKey?: string }) {
    if (b.idempotencyKey) { const ex = await this.prisma.reliefDistribution.findUnique({ where: { idempotencyKey: b.idempotencyKey }, include: { items: true } }); if (ex) return ex; }
    const a = await this.loadAlloc(u, b.allocationId);
    if (a.status !== 'APPROVED') throw new DomainError('ALLOCATION_NOT_APPROVED', `Distribution requires an APPROVED allocation (this one is ${a.status})`);
    const ids = b.items.map(i => i.itemId); if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: 'DUPLICATE_ITEM', message: 'Each item may appear once' });
    return this.prisma.$transaction(async tx => {
      let benId = b.beneficiaryId;
      if (!benId) {
        if (b.householdId) {
          const hh = await tx.affectedHousehold.findUnique({ where: { id: b.householdId }, include: { beneficiary: true } });
          if (!hh) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Household not found' }); assertInScope(u, hh.lgaId);
          benId = hh.beneficiary?.id ?? (await tx.beneficiary.create({ data: { ref: await nextRef(tx, 'BEN'), name: hh.headName, householdId: hh.id } })).id; // explicit link; beneficiary ≠ affected person
        } else if (b.beneficiaryName) benId = (await tx.beneficiary.create({ data: { ref: await nextRef(tx, 'BEN'), name: b.beneficiaryName, phone: b.phone } })).id;
        else throw new BadRequestException({ code: 'BENEFICIARY_REQUIRED', message: 'Identify a beneficiary or household' });
      }
      const sorted = [...b.items].sort((x, y) => x.itemId.localeCompare(y.itemId));
      for (const it of sorted) await this.lock(tx, a.warehouseId, it.itemId);
      const dref = await nextRef(tx, 'DST');
      const dist = await tx.reliefDistribution.create({ data: { ref: dref, allocationId: a.id, beneficiaryId: benId, distributedById: u.id, acknowledgement: b.acknowledgement, idempotencyKey: b.idempotencyKey } });
      for (const it of sorted) {
        const al = a.items.find(x => x.itemId === it.itemId);
        if (!al) throw new DomainError('ITEM_NOT_ALLOCATED', 'Item is not part of this allocation');
        const done: any[] = await tx.$queryRaw`SELECT COALESCE(SUM(di.quantity),0)::int AS q FROM distribution_items di JOIN relief_distributions rd ON rd.id = di."distributionId" WHERE rd."allocationId" = ${a.id}::uuid AND di."itemId" = ${it.itemId}::uuid`;
        if (it.quantity > al.quantity - done[0].q) throw new DomainError('EXCEEDS_ALLOCATION', `Only ${al.quantity - done[0].q} remain in this allocation for the selected item`, 409);
        const bal = await this.balance(tx, a.warehouseId, it.itemId);
        if (!hasStock(bal, it.quantity)) throw new DomainError('INSUFFICIENT_STOCK', `Only ${bal} on hand`, 409);
        await tx.distributionItem.create({ data: { distributionId: dist.id, itemId: it.itemId, quantity: it.quantity } });
        await tx.inventoryTransaction.create({ data: { warehouseId: a.warehouseId, itemId: it.itemId, type: 'DISTRIBUTION', delta: -it.quantity, reference: dref, allocationId: a.id, distributionId: dist.id, createdById: u.id } });
      }
      const rem: any[] = await tx.$queryRaw`SELECT COALESCE(SUM(ai.quantity),0)::int - COALESCE((SELECT SUM(di.quantity) FROM distribution_items di JOIN relief_distributions rd ON rd.id = di."distributionId" WHERE rd."allocationId" = ${a.id}::uuid),0)::int AS r FROM allocation_items ai WHERE ai."allocationId" = ${a.id}::uuid`;
      if (rem[0].r <= 0) await tx.reliefAllocation.update({ where: { id: a.id }, data: { status: 'FULFILLED', version: { increment: 1 } } });
      await this.audit.log(u, { action: 'relief.distribution_record', entityType: 'distribution', entityId: dist.id, after: { ref: dref, allocation: a.ref, items: b.items } }, tx);
      await tx.incidentUpdate.create({ data: { incidentId: a.incidentId, type: 'UPDATE', body: `Relief distribution ${dref} recorded (${b.items.length} item line(s)).`, authorId: u.id } });
      await this.outbox.emit(tx, 'relief.distribution_recorded', { id: dist.id, ref: dref, incidentId: a.incidentId }, a.incident.lgaId);
      return tx.reliefDistribution.findUniqueOrThrow({ where: { id: dist.id }, include: { items: true } });
    });
  }
  async distributions(u: AuthUser, q: any) {
    const where: any = { allocation: { incident: { ...scopeWhere(u) } } };
    if (q.incidentId) where.allocation.incidentId = q.incidentId; if (q.allocationId) where.allocationId = q.allocationId;
    if (q.q) where.OR = [{ ref: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      this.prisma.reliefDistribution.findMany({ where, orderBy: { distributedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { beneficiary: { select: { ref: true, name: true } }, allocation: { select: { ref: true, incident: { select: { ref: true } } } }, items: { include: { item: { select: { name: true, unit: true } } } } } }),
      this.prisma.reliefDistribution.count({ where })]);
    const pii = u.permissions.has('population.pii');
    return paged(rows.map(d => ({ id: d.id, ref: d.ref, allocation: d.allocation.ref, incident: d.allocation.incident.ref, beneficiary: pii ? d.beneficiary.name : d.beneficiary.ref, distributedAt: d.distributedAt, items: d.items.map(i => ({ name: i.item.name, unit: i.item.unit, quantity: i.quantity })) })), total, q.page, q.pageSize);
  }

  // ── Reference ──
  async items() { return { data: await this.prisma.reliefItem.findMany({ where: { active: true }, include: { category: true }, orderBy: { name: 'asc' } }) }; }
  async warehouses(u: AuthUser) { return { data: await this.prisma.warehouse.findMany({ where: { ...scopeWhere(u) }, include: { lga: true }, orderBy: { name: 'asc' } }) }; }
}
