import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { OutboxService } from '../common/outbox.service';
import { PrismaService } from '../common/prisma.service';
import { loadAuthUser } from '../auth/auth.guard';
import { AuthUser } from '../common/auth.types';

const NEEDS: Array<[string, string]> = [['report.', 'reports.read'], ['incident.', 'incidents.read'], ['deployment.', 'deployments.read'], ['team.', 'teams.read'], ['relief.', 'relief.allocations.read'], ['shelter.', 'shelters.read'], ['alert.', 'alerts.read']];

/** Socket.IO fan-out of committed outbox events. Sockets authenticate with the access token; a socket only receives events whose permission AND LGA scope it holds. Payloads carry ids/refs only — clients refetch. */
@Injectable()
export class RealtimeGateway implements OnModuleInit {
  private log = new Logger('Realtime');
  io?: Server;
  constructor(private outbox: OutboxService, private prisma: PrismaService) {}
  attach(io: Server) {
    this.io = io;
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        const claims: any = jwt.verify(token ?? '', process.env.JWT_ACCESS_SECRET!, { algorithms: ['HS256'] });
        const u = await loadAuthUser(this.prisma, claims.sub); if (!u) return next(new Error('unauthorized'));
        socket.data.user = u; socket.join(`user:${u.id}`); next();
      } catch { next(new Error('unauthorized')); }
    });
    io.on('connection', s => this.log.debug(`socket ${s.id} connected`));
  }
  onModuleInit() {
    this.outbox.bus.on('event', async (e: { id: number; type: string; payload: any; scopeLgaId?: string }) => {
      if (!this.io) return;
      const need = NEEDS.find(([p]) => e.type.startsWith(p))?.[1];
      for (const [, s] of this.io.sockets.sockets) {
        const u: AuthUser = s.data.user; if (!u) continue;
        if (need && !u.permissions.has(need)) continue;
        if (e.scopeLgaId && u.lgaScope !== null && !u.lgaScope.includes(e.scopeLgaId)) continue;
        s.emit(e.type, { eventId: e.id, ...e.payload }); // eventId lets clients de-duplicate
      }
    });
  }
}
