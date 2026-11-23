import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../common/prisma.service';
import { PERM_KEY } from '../common/decorators';
import { AuthUser } from '../common/auth.types';

/** Global guard: authenticate, rebuild current DB permissions and fail closed without explicit route permission metadata. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const h: string | undefined = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    let claims: any;
    try { claims = jwt.verify(h.slice(7), process.env.JWT_ACCESS_SECRET!, { algorithms: ['HS256'] }); }
    catch { throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Invalid or expired token' }); }
    const user = await loadAuthUser(this.prisma, claims.sub);
    if (!user) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Account unavailable' });
    const need = this.reflector.getAllAndOverride<string[]>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!need?.length) throw new ForbiddenException({ code: 'PERMISSION_REQUIRED', message: 'This route has no authorization policy' });
    if (process.env.APP_ENV === 'production' && user.mfaRequired && !user.mfaEnabled) {
      const reqUrl = req.originalUrl.split('?')[0];
      const allowedEnrollmentRoute = reqUrl.endsWith('/auth/mfa/setup') || reqUrl.endsWith('/auth/mfa/enable') || reqUrl.endsWith('/auth/me');
      if (!allowedEnrollmentRoute) throw new ForbiddenException({ code: 'MFA_ENROLMENT_REQUIRED', message: 'Complete MFA setup before using this account' });
    }
    user.ip = req.ip; user.userAgent = req.headers['user-agent'];
    req.user = user;
    if (!need.every(p => user.permissions.has(p)))
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing permission: ${need.filter(p => !user.permissions.has(p)).join(', ')}` });
    return true;
  }
}

export async function loadAuthUser(prisma: PrismaService, id: string): Promise<AuthUser | null> {
  const u = await prisma.user.findUnique({ where: { id }, include: {
    roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, scopes: true } });
  if (!u || !u.isActive) return null;
  const permissions = new Set<string>();
  u.roles.forEach(r => r.role.permissions.forEach(p => permissions.add(p.permission.key)));
  const scoped = u.scopes.length > 0 || u.roles.some(r => r.role.scopeRequired);
  return { id: u.id, email: u.email, name: u.name, roles: u.roles.map(r => r.role.key), permissions, mfaEnabled: u.mfaEnabled,
    mfaRequired: u.roles.some(r => r.role.mfaRequired), lgaScope: scoped ? u.scopes.map(s => s.lgaId) : null };
}