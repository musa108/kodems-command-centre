import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth.types';

export const PERM_KEY = 'perms';
/** Require ALL listed permissions. Backend is the authoritative enforcement layer. */
export const Perm = (...perms: string[]) => SetMetadata(PERM_KEY, perms);
export const Public = () => SetMetadata('public', true);
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
