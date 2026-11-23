try { process.loadEnvFile(); } catch { /* no .env */ }
/* Seeds REFERENCE data always (permissions, roles, categories, 21 Kogi LGA names). DEMO data only when SEED_DEMO=true AND APP_ENV != production.
   Production first admin: set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (no default credentials exist). */
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { INCIDENT_CATEGORIES, KOGI_LGAS, PERMISSIONS, RELIEF_CATEGORIES, ROLES, TEAM_CATEGORIES } from '../src/common/permissions';
import { ARGON } from '../src/auth/auth.service';

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo-Passw0rd!2026';
export const makeClient = (url = process.env.DATABASE_URL) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

export async function seedReference(db: PrismaClient) {
  for (const [key, description] of Object.entries(PERMISSIONS)) await db.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  const perms = await db.permission.findMany();
  for (const r of ROLES) {
    const role = await db.role.upsert({ where: { key: r.key }, create: { key: r.key, name: r.name, description: r.description, scopeRequired: !!r.scopeRequired, mfaRequired: !!r.mfaRequired }, update: { name: r.name, description: r.description, scopeRequired: !!r.scopeRequired, mfaRequired: !!r.mfaRequired } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: perms.filter(p => r.permissions.includes(p.key)).map(p => ({ roleId: role.id, permissionId: p.id })) });
  }
  const cats = [...INCIDENT_CATEGORIES.map(c => ['INCIDENT', ...c]), ...TEAM_CATEGORIES.map(c => ['TEAM', ...c]), ...RELIEF_CATEGORIES.map(c => ['RELIEF', ...c])];
  for (const [kind, key, label] of cats) await db.refCategory.upsert({ where: { kind_key: { kind: kind as any, key } }, create: { kind: kind as any, key, label }, update: { label } });
  for (const [i, name] of KOGI_LGAS.entries()) await db.lga.upsert({ where: { name }, create: { name, code: `KG${String(i + 1).padStart(2, '0')}`, source: 'Name verified against INEC PU directory (2015, partial) and multiple public lists; code is an internal identifier, NOT an official code. No boundaries/coordinates included.' }, update: {} });
  for (const key of ['sms', 'email', 'push', 'storage']) await db.integrationConfig.upsert({ where: { key }, create: { key, enabled: false, status: 'NOT_CONFIGURED' }, update: {} });
  await db.systemSetting.upsert({ where: { key: 'retention.affected_persons_months' }, create: { key: 'retention.affected_persons_months', value: 24 }, update: {} });
}

export async function seedAdmin(db: PrismaClient, email: string, password: string, name = 'System Administrator') {
  const role = await db.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const passwordHash = await argon2.hash(password, ARGON);
  const u = await db.user.upsert({ where: { email }, create: { email, name, passwordHash }, update: {} });
  await db.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: role.id } }, create: { userId: u.id, roleId: role.id }, update: {} });
  return u;
}

async function main() {
  const db = makeClient();
  await seedReference(db);
  console.log('reference data seeded');
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) { await seedAdmin(db, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD); console.log('admin ensured:', process.env.SEED_ADMIN_EMAIL); }
  if (process.env.SEED_DEMO === 'true') {
    if (process.env.APP_ENV === 'production') throw new Error('Refusing to seed DEMO data in production');
    const { seedDemo } = await import('./demo');
    await seedDemo(db); console.log('DEMO data seeded (all records flagged isDemo). Demo password:', DEMO_PASSWORD);
  }
  await db.$disconnect();
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
