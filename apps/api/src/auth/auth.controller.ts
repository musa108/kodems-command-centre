import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Perm, Public } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { body } from '../common/errors';

const COOKIE = 'kodems_rt';
const LIM = (n: number) => (process.env.NODE_ENV === 'test' ? 1_000_000 : n); // strict in every real environment
const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/api/v1/auth', maxAge });
const pwd = z.string().min(12, 'At least 12 characters').max(128).regex(/[a-z]/, 'Needs a lowercase letter').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a digit');
const loginS = z.object({ email: z.string().email(), password: z.string().min(1).max(128), mfaCode: z.string().regex(/^\d{6}$/).optional() });

/** CSRF: refresh/logout use a SameSite=Strict cookie AND require the custom header (not sendable cross-site without CORS preflight). */
const csrf = (req: Request) => { if (req.headers['x-requested-with'] !== 'kodems-web') throw new ForbiddenException({ code: 'CSRF', message: 'Missing CSRF header' }); };

@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Public() @Throttle({ default: { limit: LIM(10), ttl: 60000 } }) @Post('login') @HttpCode(200)
  async login(@Body(body(loginS)) b: z.infer<typeof loginS>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.login(b.email, b.password, b.mfaCode, req.ip, req.headers['user-agent']);
    res.cookie(COOKIE, r.refresh, cookieOpts(r.maxAgeMs));
    return { accessToken: r.accessToken, mfaEnrolmentRequired: r.mfaEnrolmentRequired };
  }
  @Public() @Throttle({ default: { limit: LIM(30), ttl: 60000 } }) @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    csrf(req);
    const r = await this.svc.refresh(req.cookies?.[COOKIE], req.ip, req.headers['user-agent']);
    res.cookie(COOKIE, r.refresh, cookieOpts(r.maxAgeMs));
    return { accessToken: r.accessToken };
  }
  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    csrf(req); await this.svc.logout(req.cookies?.[COOKIE]); res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  }
  @Public() @Throttle({ default: { limit: LIM(5), ttl: 60000 } }) @Post('forgot-password') @HttpCode(200)
  forgot(@Body(body(z.object({ email: z.string().email() }))) b: { email: string }) { return this.svc.forgotPassword(b.email); }
  @Public() @Throttle({ default: { limit: LIM(5), ttl: 60000 } }) @Post('reset-password') @HttpCode(204)
  async reset(@Body(body(z.object({ token: z.string().min(10), password: pwd }))) b: { token: string; password: string }) { await this.svc.resetPassword(b.token, b.password); }
  @Get('me') @Perm('dashboard.read') me(@CurrentUser() u: AuthUser) { return this.svc.me(u.id); }
  @Post('mfa/setup') @Perm('dashboard.read') mfaSetup(@CurrentUser() u: AuthUser) { return this.svc.mfaSetup(u.id); }
  @Post('mfa/enable') @Perm('dashboard.read') @HttpCode(204)
  async mfaEnable(@CurrentUser() u: AuthUser, @Body(body(z.object({ code: z.string().regex(/^\d{6}$/) }))) b: { code: string }) { await this.svc.mfaEnable(u.id, b.code); }
}
export { pwd as passwordSchema };
