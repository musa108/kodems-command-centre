import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ago, fmtMinutes, fmtNum, humanize } from '@/lib/format';
import { can, canAny, NAV } from '@/lib/permissions';
import { eventToQueryKeys } from '@/lib/socket';
import { ApiError, request, setAccessToken } from '@/lib/api';
import { buildSchema } from '@/components/ui';

const me: any = { permissions: ['incidents.read', 'incidents.verify'] };
describe('format', () => {
  it('formats minutes and nulls honestly', () => { expect(fmtMinutes(null)).toBe('No data'); expect(fmtMinutes(5.25)).toBe('5.3 min'); expect(fmtMinutes(135)).toBe('2 h 15 min'); expect(fmtNum(null)).toBe('—'); });
  it('humanizes enums', () => expect(humanize('RESPONSE_ACTIVE')).toBe('Response active'));
  it('relative time', () => { const now = Date.now(); expect(ago(new Date(now - 5 * 60000), now)).toBe('5 min ago'); expect(ago(new Date(now - 3 * 3600000), now)).toBe('3 h ago'); });
});
describe('permission helpers (UI hints only)', () => {
  it('can requires all; canAny requires one', () => { expect(can(me, 'incidents.read')).toBe(true); expect(can(me, 'incidents.read', 'incidents.close')).toBe(false); expect(canAny(me, 'x', 'incidents.verify')).toBe(true); expect(can(null, 'x')).toBe(false); });
  it('every nav item declares a permission', () => { for (const g of NAV) for (const i of g.items) expect(i.perm?.length).toBeGreaterThan(0); });
});
describe('realtime event mapping', () => { it('maps events to query keys to refetch', () => { expect(eventToQueryKeys('incident.created')).toContainEqual(['incidents']); expect(eventToQueryKeys('deployment.arrived')).toContainEqual(['teams']); expect(eventToQueryKeys('shelter.occupancy_updated')).toContainEqual(['shelters']); }); });
describe('form schema builder', () => {
  const s = buildSchema([{ name: 'title', label: 'Title', required: true, minLength: 5 }, { name: 'n', label: 'N', type: 'number', required: true, min: 1 }, { name: 'opt', label: 'Opt' }]);
  it('rejects empty/short required fields with readable messages', () => { const r = s.safeParse({ title: 'abc', n: '0', opt: '' }); expect(r.success).toBe(false); if (!r.success) { expect(r.error.flatten().fieldErrors.title?.[0]).toMatch(/At least 5/); expect(r.error.flatten().fieldErrors.n).toBeTruthy(); } });
  it('coerces numbers and turns empty optionals into undefined', () => { const r = s.safeParse({ title: 'Hello world', n: '3', opt: '' }); expect(r.success).toBe(true); if (r.success) { expect(r.data.n).toBe(3); expect(r.data.opt).toBeUndefined(); } });
});
describe('api client', () => {
  beforeEach(() => { setAccessToken('tok'); vi.restoreAllMocks(); });
  it('sends bearer token and maps the error envelope to ApiError', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fieldErrors: { title: ['Required'] } }, requestId: 'r1' } }), { status: 400 }));
    const e: any = await request('/incidents', { method: 'POST', body: {} }).catch(x => x); expect(e).toBeInstanceOf(ApiError); expect(e.code).toBe('VALIDATION_ERROR'); expect(e.fieldErrors.title).toEqual(['Required']); expect(e.requestId).toBe('r1');
    expect((f.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer tok');
  });
  it('on 401 refreshes once and retries the request', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'new' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const r = await request('/incidents'); expect(r).toEqual({ ok: 1 }); expect(f).toHaveBeenCalledTimes(3); expect(String(f.mock.calls[1][0])).toContain('/auth/refresh'); expect((f.mock.calls[1][1] as any).headers['X-Requested-With']).toBe('kodems-web'); expect((f.mock.calls[2][1] as any).headers.Authorization).toBe('Bearer new');
  });
  it('reports network failure with a clear message', async () => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed')); const e: any = await request('/x').catch(x => x); expect(e.code).toBe('NETWORK'); expect(e.message).toMatch(/Cannot reach/); });
  it('does not retry auth endpoints on 401 (no refresh loop)', async () => { const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid' } }), { status: 401 })); await request('/auth/login', { method: 'POST', body: {} }).catch(() => undefined); expect(f).toHaveBeenCalledTimes(1); });
});
