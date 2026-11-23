import { ConflictVersion } from './errors';
import { Tx } from './prisma.service';

/** Optimistic concurrency: update only if the caller saw the current version, else 409. Never silently overwrites newer data. */
export async function occUpdate(tx: Tx, model: string, id: string, expectedVersion: number | undefined, data: Record<string, any>) {
  const m = (tx as any)[model];
  if (expectedVersion === undefined) {
    return m.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  }
  const r = await m.updateMany({ where: { id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (r.count === 0) throw new ConflictVersion();
  return m.findUniqueOrThrow({ where: { id } });
}
