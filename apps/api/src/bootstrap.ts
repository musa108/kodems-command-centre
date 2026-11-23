import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from './common/errors';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { Server } from 'socket.io';

export function configure(app: INestApplication) {
  app.setGlobalPrefix('api/v1', { exclude: [] });
  app.use((req: any, res: any, next: any) => { req.id = req.headers['x-request-id'] || randomUUID(); res.setHeader('x-request-id', req.id); next(); });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','), credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
}
export function attachRealtime(app: INestApplication) {
  const io = new Server(app.getHttpServer(), { path: '/socket.io', cors: { origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','), credentials: true } });
  app.get(RealtimeGateway).attach(io);
  return io;
}
