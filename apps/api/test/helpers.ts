import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client as PgClient } from 'pg';
import { AppModule } from '../src/app.module';
import { configure } from '../src/bootstrap';
import { migrate } from '../scripts/migrate';
import { makeClient, seedReference, DEMO_PASSWORD } from '../prisma/seed';
import { seedDemo } from '../prisma/demo';

export const PW = DEMO_PASSWORD;
/** Each run starts from an empty schema. Refuses to touch any database whose name does not end in _test. */
async function resetTestDb(url: string) {
  if (!/\/[a-z0-9_]+_test(\?|$)/.test(url)) throw new Error('Refusing to reset a non-test database: ' + url);
  const c = new PgClient({ connectionString: url }); await c.connect();
  try { await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS postgis;'); } finally { await c.end(); }
}
export async function boot() {
  await resetTestDb(process.env.DATABASE_URL!);
  await migrate(process.env.DATABASE_URL);
  const db = makeClient(); await seedReference(db); await seedDemo(db);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication(); configure(app); await app.init();
  return { app, db };
}
export class Client {
  constructor(public app: INestApplication, public token = '') {}
  static async login(app: INestApplication, email: string, password = PW) { const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }); if (r.status !== 200) throw new Error(`login ${email} → ${r.status} ${JSON.stringify(r.body)}`); return new Client(app, r.body.accessToken); }
  private rq(m: 'get' | 'post' | 'patch', url: string) { return (request(this.app.getHttpServer()) as any)[m]('/api/v1' + url).set('Authorization', `Bearer ${this.token}`); }
  get = (u: string) => this.rq('get', u);
  post = (u: string, b: any = {}, h: Record<string, string> = {}) => { let r = this.rq('post', u).send(b); for (const [k, v] of Object.entries(h)) r = r.set(k, v); return r; };
  patch = (u: string, b: any = {}) => this.rq('patch', u).send(b);
}
export const uniq = () => Math.random().toString(36).slice(2, 8);
