try { process.loadEnvFile(); } catch { /* no .env: rely on real environment */ }
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { attachRealtime, configure } from './bootstrap';

async function main() {
  if (!['development', 'staging', 'production'].includes(process.env.APP_ENV || '')) throw new Error('APP_ENV must be explicitly set to development, staging, or production');
  if (process.env.APP_ENV === 'production' && process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV=production is required when APP_ENV=production');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set');
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) throw new Error('JWT_ACCESS_SECRET must be set (>=32 chars)');
  if (process.env.APP_ENV === 'production' && /dev-only|CHANGE_ME/.test(process.env.JWT_ACCESS_SECRET)) throw new Error('Refusing to start production with a development secret');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  configure(app);
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  attachRealtime(app);
  new Logger('Bootstrap').log(`KODEMS API on :${port}/api/v1 (APP_ENV=${process.env.APP_ENV})`);
}
main();
