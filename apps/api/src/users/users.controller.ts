import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';
import { pageQuery, paged } from '../common/pagination';
import { ARGON } from '../auth/auth.service';
import { passwordSchema } from '../auth/auth.controller';
import { ConflictVersion } from '../common/errors';
import { PERMISSIONS } from '../common/permissions';

const createS = z.object({ email: z.string().email(), name: z.string().min(2).max(120), phone: z.string().max(30).optional(), password: passwordSchema,
  roleKeys: z.array(z.string()).min(1), lgaIds: z.array(z.string().uuid()).default([]) });
const patchS = z.object({ name: z.string().min(2).max(120).optional(), phone: z.string().max(30).nullable().optional(), isActive: z.boolean().optional(),
  roleKeys: z.array(z.string()).min(1).optional(), lgaIds: z.array(z.string().uuid()).optional(), password: passwordSchema.optional(), version: z.number().int().optional(), reason: z.string().max(300).optional() });
const roleS = z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/), name: z.string().min(3), description: z.string().optional(), permissions: z.array(z.string()).min(1), scopeRequired: z.boolean().default(false) });

const pub = (u: any) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, isActive: u.isActive, mfaEnabled: u.mfaEnabled, lastLoginAt: u.lastLoginAt, version: u.version, isDemo: u.isDemo,
  roles: u.roles?.map((r: any) => r.role.key), scope: u.scopes?.map((s: any) => ({ id: s.lgaId, name: s.lga?.name })) });

@Controller()
export class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('users') @Perm('users.manage')
  async list(@Query() raw: any) {
    const q = pageQuery.parse(raw);
    const where: any = q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: { roles: { include: { role: true } }, scopes: { include: { lga: true } } }, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.user.count({ where })]);
    return paged(rows.map(pub), total, q.page, q.pageSize);
  }

  @Post('users') @Perm('users.manage')
  async create(@CurrentUser() actor: AuthUser, @Body(body(createS)) b: z.infer<typeof createS>) {
    if (await this.prisma.user.findUnique({ where: { email: b.email.toLowerCase() } })) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email already registered' });
    const roles = await this.prisma.role.findMany({ where: { key: { in: b.roleKeys } } });
    if (roles.length !== b.roleKeys.length) throw new BadRequestException({ code: 'UNKNOWN_ROLE', message: 'Unknown role' });
    if (roles.some(r => r.scopeRequired) && !b.lgaIds.length) throw new BadRequestException({ code: 'SCOPE_REQUIRED', message: 'This role requires at least one LGA scope' });
    const passwordHash = await argon2.hash(b.password, ARGON);
    const u = await this.prisma.$transaction(async tx => {
      const u = await tx.user.create({ data: { email: b.email.toLowerCase(), name: b.name, phone: b.phone, passwordHash,
        roles: { create: roles.map(r => ({ roleId: r.id })) }, scopes: { create: b.lgaIds.map(lgaId => ({ lgaId })) } },
        include: { roles: { include: { role: true } }, scopes: { include: { lga: true } } } });
      await this.audit.log(actor, { action: 'users.create', entityType: 'user', entityId: u.id, after: { email: u.email, roles: b.roleKeys, lgaIds: b.lgaIds } }, tx);
      return u;
    });
    return pub(u);
  }

  @Patch('users/:id') @Perm('users.manage')
  async patch(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchS)) b: z.infer<typeof patchS>) {
    const cur = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } }, scopes: true } });
    if (!cur) throw new NotFoundException();
    if (b.version !== undefined && b.version !== cur.version) throw new ConflictVersion();
    if (b.roleKeys?.includes('SUPER_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw new BadRequestException({ code: 'SUPER_ADMIN_REQUIRES_SUPER_ADMIN', message: 'Only a super administrator can grant the super administrator role' });
    if (id === actor.id && b.roleKeys && !b.roleKeys.every(key => cur.roles.some(r => r.role.key === key))) throw new BadRequestException({ code: 'SELF_ROLE_CHANGE', message: 'You cannot grant yourself additional roles' });
    if (id === actor.id && b.isActive === false) throw new BadRequestException({ code: 'SELF_DEACTIVATE', message: 'You cannot deactivate your own account' });
    const u = await this.prisma.$transaction(async tx => {
      if (b.roleKeys) {
        const roles = await tx.role.findMany({ where: { key: { in: b.roleKeys } } });
        if (roles.length !== b.roleKeys.length) throw new BadRequestException({ code: 'UNKNOWN_ROLE', message: 'Unknown role' });
        const lgaIds = b.lgaIds ?? cur.scopes.map(s => s.lgaId);
        if (roles.some(r => r.scopeRequired) && !lgaIds.length) throw new BadRequestException({ code: 'SCOPE_REQUIRED', message: 'This role requires at least one LGA scope' });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map(r => ({ userId: id, roleId: r.id })) });
      }
      if (b.lgaIds) { await tx.userScope.deleteMany({ where: { userId: id } }); await tx.userScope.createMany({ data: b.lgaIds.map(lgaId => ({ userId: id, lgaId })) }); }
      const u = await tx.user.update({ where: { id }, data: { name: b.name, phone: b.phone, isActive: b.isActive, passwordHash: b.password ? await argon2.hash(b.password, ARGON) : undefined, version: { increment: 1 } },
        include: { roles: { include: { role: true } }, scopes: { include: { lga: true } } } });
      if (b.isActive === false || b.password) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(actor, { action: b.isActive === false ? 'users.deactivate' : 'users.update', entityType: 'user', entityId: id,
        before: { name: cur.name, isActive: cur.isActive, roles: cur.roles.map(r => r.role.key), lgaIds: cur.scopes.map(s => s.lgaId) },
        after: { name: u.name, isActive: u.isActive, roles: u.roles.map(r => r.role.key), lgaIds: u.scopes.map(s => s.lgaId), passwordChanged: !!b.password }, reason: b.reason }, tx);
      return u;
    });
    return pub(u);
  }

  @Get('users/:id/activity') @Perm('users.manage')
  async activity(@Param('id', ParseUUIDPipe) id: string) {
    const [logins, sessions] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { OR: [{ userId: id }, { entityType: 'user', entityId: id }], action: { startsWith: 'auth.' } }, orderBy: { at: 'desc' }, take: 50, select: { id: true, action: true, at: true, ip: true, userAgent: true, reason: true } }),
      this.prisma.session.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, ip: true, userAgent: true, revokedAt: true, expiresAt: true } })]);
    return { logins: logins.map(l => ({ ...l, id: String(l.id) })), sessions };
  }

  @Get('roles') @Perm('users.manage')
  async roles() {
    const roles = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
    return { data: roles.map(r => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, scopeRequired: r.scopeRequired, mfaRequired: r.mfaRequired, userCount: r._count.users, permissions: r.permissions.map(p => p.permission.key).sort() })) };
  }
  @Post('roles') @Perm('users.manage')
  async createRole(@CurrentUser() actor: AuthUser, @Body(body(roleS)) b: z.infer<typeof roleS>) {
    const bad = b.permissions.filter(p => !(p in PERMISSIONS)); if (bad.length) throw new BadRequestException({ code: 'UNKNOWN_PERMISSION', message: `Unknown permissions: ${bad.join(', ')}` });
    if (!actor.roles.includes('SUPER_ADMIN') && b.permissions.some(p => p === 'config.manage' || p === 'users.manage')) throw new BadRequestException({ code: 'PRIVILEGED_PERMISSION_REQUIRES_SUPER_ADMIN', message: 'Only a super administrator can create roles with user or configuration management permissions' });
    if (await this.prisma.role.findUnique({ where: { key: b.key } })) throw new ConflictException({ code: 'ROLE_EXISTS', message: 'Role key exists' });
    const perms = await this.prisma.permission.findMany({ where: { key: { in: b.permissions } } });
    const r = await this.prisma.$transaction(async tx => {
      const r = await tx.role.create({ data: { key: b.key, name: b.name, description: b.description, isSystem: false, scopeRequired: b.scopeRequired, permissions: { create: perms.map(p => ({ permissionId: p.id })) } } });
      await this.audit.log(actor, { action: 'roles.create', entityType: 'role', entityId: r.id, after: b }, tx); return r;
    });
    return { id: r.id, key: r.key };
  }
  @Get('permissions') @Perm('users.manage')
  async permissions() { return { data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })) }; }
}
