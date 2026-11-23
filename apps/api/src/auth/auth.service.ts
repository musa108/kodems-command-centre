import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { loadAuthUser } from './auth.guard';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_FAILS = 5, LOCK_MIN = 15;
export const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private accessToken(userId: string) {
    return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET!, { algorithm: 'HS256', expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS || 900) });
  }
  private async newSession(userId: string, ip?: string, ua?: string) {
    const refresh = randomBytes(48).toString('base64url');
    const days = Number(process.env.REFRESH_TTL_DAYS || 7);
    await this.prisma.session.create({ data: { userId, refreshHash: sha(refresh), ip, userAgent: ua?.slice(0, 200), expiresAt: new Date(Date.now() + days * 864e5) } });
    return { refresh, maxAgeMs: days * 864e5 };
  }

  async login(email: string, password: string, mfaCode: string | undefined, ip?: string, ua?: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { roles: { include: { role: true } } } });
    const fail = async (reason: string) => { await this.audit.log({ id: u?.id ?? '', ip, userAgent: ua } as any, { action: 'auth.login_failed', entityType: 'user', entityId: u?.id, reason }).catch(() => undefined); throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }); };
    if (!u || !u.isActive) return fail('unknown_or_inactive');
    if (u.lockedUntil && u.lockedUntil > new Date()) throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again later.' });
    if (!(await argon2.verify(u.passwordHash, password))) {
      const fails = u.failedLogins + 1;
      await this.prisma.user.update({ where: { id: u.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null } });
      return fail('bad_password');
    }
    const mfaMandatory = u.roles.some(r => r.role.mfaRequired) && process.env.APP_ENV === 'production';
    if (u.mfaEnabled) {
      if (!mfaCode) throw new UnauthorizedException({ code: 'MFA_REQUIRED', message: 'Verification code required' });
      if (!authenticator.check(mfaCode, u.mfaSecret!)) return fail('bad_mfa');
    } else if (mfaMandatory) {
      // Privileged account without MFA in production: allow login ONLY so the user can enrol; flagged to the client.
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const { refresh, maxAgeMs } = await this.newSession(u.id, ip, ua);
    await this.audit.log({ id: u.id, ip, userAgent: ua }, { action: 'auth.login', entityType: 'user', entityId: u.id });
    return { accessToken: this.accessToken(u.id), refresh, maxAgeMs, mfaEnrolmentRequired: mfaMandatory && !u.mfaEnabled };
  }

  /** Rotating refresh tokens: a used token is revoked; re-use of a revoked token revokes every session of that user. */
  async refresh(token: string | undefined, ip?: string, ua?: string) {
    if (!token) throw new UnauthorizedException({ code: 'NO_REFRESH', message: 'No session' });
    const s = await this.prisma.session.findUnique({ where: { refreshHash: sha(token) } });
    if (!s) throw new UnauthorizedException({ code: 'SESSION_INVALID', message: 'Session invalid' });
    if (s.revokedAt) { await this.prisma.session.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } }); throw new UnauthorizedException({ code: 'SESSION_REUSED', message: 'Session invalid' }); }
    if (s.expiresAt < new Date()) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired' });
    const user = await loadAuthUser(this.prisma, s.userId);
    if (!user) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Account unavailable' });
    await this.prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    const n = await this.newSession(s.userId, ip, ua);
    return { accessToken: this.accessToken(s.userId), refresh: n.refresh, maxAgeMs: n.maxAgeMs };
  }

  async logout(token: string | undefined) {
    if (token) await this.prisma.session.updateMany({ where: { refreshHash: sha(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async forgotPassword(email: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u || !u.isActive) return { devToken: undefined };
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({ data: { userId: u.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + 3600e3) } });
    await this.audit.log({ id: u.id }, { action: 'auth.password_reset_requested', entityType: 'user', entityId: u.id });
    // Email provider is not integrated: the token is only returned outside production so the flow is testable.
    return { devToken: process.env.APP_ENV === 'production' ? undefined : token };
  }
  async resetPassword(token: string, password: string) {
    const t = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha(token) } });
    if (!t || t.usedAt || t.expiresAt < new Date()) throw new BadRequestException({ code: 'RESET_INVALID', message: 'Reset link is invalid or expired' });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await argon2.hash(password, ARGON), failedLogins: 0, lockedUntil: null, version: { increment: 1 } } }),
      this.prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ id: t.userId }, { action: 'auth.password_reset', entityType: 'user', entityId: t.userId });
  }

  async mfaSetup(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
    return { secret, otpauthUrl: authenticator.keyuri(u.email, 'KOSEMA KODEMS', secret) };
  }
  async mfaEnable(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaSecret || !authenticator.check(code, u.mfaSecret)) throw new BadRequestException({ code: 'MFA_BAD_CODE', message: 'Invalid code' });
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ id: userId }, { action: 'auth.mfa_enabled', entityType: 'user', entityId: userId });
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } }, scopes: { include: { lga: true } } } });
    const au = (await loadAuthUser(this.prisma, userId))!;
    return { id: u.id, email: u.email, name: u.name, phone: u.phone, mfaEnabled: u.mfaEnabled, isDemo: u.isDemo,
      roles: u.roles.map(r => ({ key: r.role.key, name: r.role.name })), permissions: [...au.permissions].sort(),
      scope: u.scopes.map(s => ({ id: s.lgaId, name: s.lga.name })), statewide: au.lgaScope === null,
      environment: process.env.APP_ENV || 'development' };
  }
}
