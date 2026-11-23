import { z } from 'zod';
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export const paged = <T>(data: T[], total: number, page: number, pageSize: number) => ({ data, meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) } });
export const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
