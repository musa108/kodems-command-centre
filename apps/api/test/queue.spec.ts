/* Exercises the REAL BullMQ path against Redis (other suites run jobs inline). */
process.env.JOBS_INLINE = 'false';
import { INestApplication } from '@nestjs/common';
import { Client, boot } from './helpers';
import { makeClient } from '../prisma/seed';

let app: INestApplication, db: ReturnType<typeof makeClient>;
beforeAll(async () => { ({ app, db } = await boot()); });
afterAll(async () => { await app.close(); await db.$disconnect(); });

it('publishing an alert enqueues a BullMQ job whose worker records honest delivery status', async () => {
  const ops = await Client.login(app, 'ops@demo.kodems.test'), admin = await Client.login(app, 'admin@demo.kodems.test');
  const lga = (await ops.get('/geography/lgas')).body.data[0].id; const cat = (await ops.get('/config/categories?kind=INCIDENT')).body.data[0].id;
  const a = await ops.post('/alerts', { title: 'Queue test alert', message: 'Testing the background delivery queue path.', categoryId: cat, severity: 'LOW', targetLgaIds: [lga], expiresAt: new Date(Date.now() + 864e5).toISOString(), channels: ['SMS', 'PUSH'] });
  await ops.post(`/alerts/${a.body.id}/submit-approval`); await admin.post(`/alerts/${a.body.id}/approve`, { decision: 'APPROVED' });
  expect((await admin.post(`/alerts/${a.body.id}/publish`)).status).toBe(201);
  let logs: any[] = []; for (let i = 0; i < 40 && logs.filter(l => l.channel !== 'IN_APP').length < 2; i++) { await new Promise(r => setTimeout(r, 250)); logs = await db.notificationDeliveryLog.findMany({ where: { alertId: a.body.id } }); }
  expect(logs.filter(l => l.channel !== 'IN_APP').map(l => `${l.channel}:${l.status}`).sort()).toEqual(['PUSH:NOT_CONFIGURED', 'SMS:NOT_CONFIGURED']);
});
