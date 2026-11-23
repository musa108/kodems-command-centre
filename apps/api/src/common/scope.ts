import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth.types';

/** Prisma `where` fragment restricting rows to the user's LGA scope. */
export function scopeWhere(u: AuthUser, field = 'lgaId'): Record<string, any> {
  return u.lgaScope === null ? {} : { [field]: { in: u.lgaScope } };
}
export function assertInScope(u: AuthUser, lgaId: string) {
  if (u.lgaScope !== null && !u.lgaScope.includes(lgaId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'Record is outside your geographical scope' });
}
