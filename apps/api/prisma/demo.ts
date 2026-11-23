/* DEMO DATA — explicitly fictional. Coordinates are rough placeholders near well-known Kogi towns for UI demonstration ONLY and are not survey data.
   Every row carries isDemo=true; the UI shows a DEMO banner whenever demo rows are visible. */
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { ARGON } from '../src/auth/auth.service';

const PW = process.env.DEMO_PASSWORD || 'Demo-Passw0rd!2026';
const PLACES: Record<string, [number, number]> = { Lokoja: [7.80, 6.74], Okene: [7.55, 6.23], Idah: [7.11, 6.74], Ankpa: [7.38, 7.62], Kabba: [7.83, 6.07] }; // approximate placeholders
export const DEMO_USERS: Array<[string, string, string, string?]> = [
  ['superadmin@demo.kodems.test', 'Demo Super Admin', 'SUPER_ADMIN'], ['admin@demo.kodems.test', 'Demo Agency Admin', 'AGENCY_ADMIN'], ['ops@demo.kodems.test', 'Demo Operations Officer', 'OPS_OFFICER'],
  ['verifier@demo.kodems.test', 'Demo Verification Officer', 'VERIFICATION_OFFICER'], ['coordinator@demo.kodems.test', 'Demo Response Coordinator', 'RESPONSE_COORDINATOR'],
  ['relief@demo.kodems.test', 'Demo Relief Officer', 'RELIEF_OFFICER'], ['relief2@demo.kodems.test', 'Demo Relief Approver', 'RELIEF_OFFICER'], ['shelter@demo.kodems.test', 'Demo Shelter Coordinator', 'SHELTER_COORDINATOR'],
  ['me@demo.kodems.test', 'Demo M&E Officer', 'ME_OFFICER'], ['lga.lokoja@demo.kodems.test', 'Demo LGA Officer (Lokoja)', 'LGA_OFFICER', 'Lokoja'], ['exec@demo.kodems.test', 'Demo Executive Viewer', 'EXEC_VIEWER'],
];

export async function seedDemo(db: PrismaClient) {
  const hash = await argon2.hash(PW, ARGON);
  const lga = Object.fromEntries((await db.lga.findMany()).map(l => [l.name, l.id])); const cat = Object.fromEntries((await db.refCategory.findMany()).map(c => [`${c.kind}:${c.key}`, c.id]));
  const users: Record<string, string> = {};
  for (const [email, name, role, scope] of DEMO_USERS) {
    const r = await db.role.findUniqueOrThrow({ where: { key: role } });
    const u = await db.user.upsert({ where: { email }, create: { email, name, passwordHash: hash, isDemo: true }, update: { passwordHash: hash } });
    await db.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: r.id } }, create: { userId: u.id, roleId: r.id }, update: {} });
    if (scope) await db.userScope.upsert({ where: { userId_lgaId: { userId: u.id, lgaId: lga[scope] } }, create: { userId: u.id, lgaId: lga[scope] }, update: {} });
    users[email] = u.id;
  }
  if (await db.incident.count({ where: { isDemo: true } })) return; // idempotent
  const ops = users['ops@demo.kodems.test'];
  const mkInc = async (n: number, title: string, c: string, sev: any, place: string, status: any, est: number) => db.incident.create({ data: { ref: `DEMO-INC-${String(n).padStart(4, '0')}`, title: `[DEMO] ${title}`, description: `DEMO DATA — fictional incident for demonstration. ${title}.`, categoryId: cat[`INCIDENT:${c}`], severity: sev, status, lat: PLACES[place][0], lng: PLACES[place][1], lgaId: lga[place === 'Kabba' ? 'Kabba/Bunu' : place], estAffected: est, createdById: ops, ownerId: ops, isDemo: true,
    history: { create: { to: 'OPEN', actorId: ops, reason: 'DEMO seed' } } } });
  const i1 = await mkInc(1, 'Riverine flooding in demo community A', 'flood', 'CRITICAL', 'Lokoja', 'RESPONSE_ACTIVE', 1200);
  const i2 = await mkInc(2, 'Market fire in demo community B', 'fire', 'HIGH', 'Okene', 'ASSESSMENT', 300);
  await mkInc(3, 'Road accident on demo highway', 'road_accident', 'MODERATE', 'Idah', 'OPEN', 12);
  await mkInc(4, 'Displacement after demo security incident', 'displacement', 'HIGH', 'Ankpa', 'OPEN', 450);
  for (let n = 1; n <= 5; n++) {
    const place = Object.keys(PLACES)[n - 1];
    await db.incidentReport.create({ data: { ref: `DEMO-RPT-${String(n).padStart(4, '0')}`, categoryId: cat[`INCIDENT:${['flood', 'fire', 'building_collapse', 'road_accident', 'flood'][n - 1]}`], description: `DEMO DATA — fictional community report #${n} awaiting verification.`, incidentAt: new Date(Date.now() - n * 3600e3), lat: PLACES[place][0] + n / 500, lng: PLACES[place][1] + n / 500,
      lgaId: lga[place === 'Kabba' ? 'Kabba/Bunu' : place], suggestedSeverity: (['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'HIGH'] as const)[n - 1], estAffected: n * 20, isDemo: true, history: { create: { to: 'SUBMITTED', reason: 'DEMO seed' } } } });
  }
  const tcats: Array<[string, string, string]> = [['search_rescue', 'Demo Search & Rescue Team A', 'Lokoja'], ['medical_response', 'Demo Medical Response Team B', 'Okene'], ['fire_response', 'Demo Fire Response Team C', 'Okene'], ['flood_response', 'Demo Flood Response Team D', 'Lokoja']];
  for (const [i, [k, name, place]] of tcats.entries()) await db.responseTeam.create({ data: { code: `DEMO-TM-${i + 1}`, name, categoryId: cat[`TEAM:${k}`], agency: 'DEMO AGENCY (fictional)', lgaId: lga[place], baseLat: PLACES[place][0], baseLng: PLACES[place][1], isDemo: true,
    capabilities: { create: [{ name: k.replace('_', ' ') }] }, members: { create: [{ name: `Demo Leader ${i + 1}`, isLeader: true, role: 'Team leader' }, { name: `Demo Member ${i + 1}`, role: 'Responder' }] } } });
  const hh = await db.affectedHousehold.create({ data: { ref: 'DEMO-HH-0001', headName: 'Demo Household Head', incidentId: i1.id, lgaId: i1.lgaId, size: 5, damage: 'SEVERE', displacement: 'DISPLACED', immediateNeeds: 'DEMO: water, bedding', isDemo: true } });
  await db.affectedPerson.create({ data: { ref: 'DEMO-PER-0001', householdId: hh.id, name: 'Demo Person One', ageBand: '18-59', displacement: 'DISPLACED' } });
  const wh = await db.warehouse.create({ data: { code: 'DEMO-WH-1', name: 'Demo Central Warehouse (fictional)', lgaId: lga['Lokoja'], lat: 7.79, lng: 6.73, isDemo: true } });
  const items = [['DEMO-RICE', 'Rice (demo)', 'food', 'kg', 5000], ['DEMO-WATER', 'Drinking water (demo)', 'water', 'litre', 8000], ['DEMO-MATT', 'Mattress (demo)', 'bedding', 'piece', 400]] as const;
  for (const [sku, name, c, unit, qty] of items) { const it = await db.reliefItem.create({ data: { sku, name, categoryId: cat[`RELIEF:${c}`], unit } }); await db.inventoryTransaction.create({ data: { warehouseId: wh.id, itemId: it.id, type: 'RECEIPT', delta: qty, reference: 'DEMO opening stock', createdById: users['relief@demo.kodems.test'] } }); }
  await db.shelter.create({ data: { code: 'DEMO-SHL-1', name: 'Demo Evacuation Centre (fictional)', lgaId: lga['Lokoja'], lat: 7.81, lng: 6.75, capacity: 200, facilities: ['water', 'latrines'], isDemo: true } });
  await db.incidentUpdate.create({ data: { incidentId: i2.id, type: 'UPDATE', body: 'DEMO: initial assessment under way.', authorId: ops } });
}
