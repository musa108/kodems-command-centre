import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
export type ConnState = 'connecting' | 'live' | 'offline';

/** Authenticated socket; server only sends events this user is permitted/scoped for. Payloads are treated as hints: we validate shape and refetch via the API. */
export function createSocket(onState: (s: ConnState) => void, onEvent: (type: string, payload: { eventId?: number }) => void): Socket {
  const s = io(SOCKET_URL, { path: '/socket.io', auth: (cb) => cb({ token: getAccessToken() }), reconnection: true, reconnectionDelayMax: 10000, transports: ['websocket', 'polling'] });
  const seen = new Set<number>();
  s.on('connect', () => onState('live')); s.on('disconnect', () => onState('offline')); s.on('connect_error', () => onState('offline')); s.io.on('reconnect_attempt', () => onState('connecting'));
  s.onAny((type: string, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || typeof type !== 'string') return;
    const id = (payload as any).eventId; if (typeof id === 'number') { if (seen.has(id)) return; seen.add(id); if (seen.size > 500) seen.delete(seen.values().next().value as number); }
    onEvent(type, payload as any);
  });
  return s;
}
export const eventToQueryKeys = (type: string): string[][] => {
  const p = type.split('.')[0];
  const map: Record<string, string[][]> = { report: [['reports'], ['dashboard'], ['notifications']], incident: [['incidents'], ['dashboard'], ['map'], ['notifications']], deployment: [['deployments'], ['teams'], ['incidents'], ['dashboard'], ['map']], team: [['teams'], ['map']], relief: [['relief'], ['dashboard']], shelter: [['shelters'], ['map'], ['dashboard']], alert: [['alerts'], ['notifications']] };
  return map[p] ?? [['notifications']];
};
