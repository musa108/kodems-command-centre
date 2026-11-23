import { PrismaService, Tx } from './prisma.service';
/** Human-readable references, e.g. KOS-INC-2026-000123. Counters are Postgres sequences created by migration 0003 (gap-tolerant, concurrency-safe). */
const PREFIXES = new Set(['INC', 'RPT', 'TM', 'DEP', 'HH', 'PER', 'BEN', 'DST', 'ALC', 'SHL', 'ALR']);
export async function nextRef(db: Tx | PrismaService, prefix: string): Promise<string> {
  if (!PREFIXES.has(prefix)) throw new Error(`unknown ref prefix ${prefix}`);
  const rows: any[] = await (db as any).$queryRawUnsafe(`SELECT nextval('ref_seq_${prefix.toLowerCase()}') AS n`);
  return `KOS-${prefix}-${new Date().getUTCFullYear()}-${String(rows[0].n).padStart(6, '0')}`;
}
