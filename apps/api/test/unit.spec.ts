import { canTransition, REPORT_TRANSITIONS, INCIDENT_TRANSITIONS, DEPLOYMENT_TRANSITIONS, signedDelta, hasStock, shelterStatusFor } from '../src/common/state';
import { PERMISSIONS, ROLES, KOGI_LGAS } from '../src/common/permissions';
import { StorageService } from '../src/common/storage.service';
import { BadRequestException } from '@nestjs/common';

describe('state machines', () => {
  it('report: terminal states cannot move', () => { for (const s of ['VERIFIED', 'REJECTED', 'DUPLICATE']) expect(REPORT_TRANSITIONS[s]).toEqual([]); });
  it('report: SUBMITTED can be verified, rejected, duplicated', () => { ['VERIFIED', 'REJECTED', 'DUPLICATE', 'UNDER_REVIEW'].forEach(t => expect(canTransition(REPORT_TRANSITIONS, 'SUBMITTED', t)).toBe(true)); });
  it('incident: cannot jump OPEN→CLOSED, closed only from resolved', () => { expect(canTransition(INCIDENT_TRANSITIONS, 'OPEN', 'CLOSED')).toBe(false); expect(canTransition(INCIDENT_TRANSITIONS, 'RESOLVED', 'CLOSED')).toBe(true); });
  it('deployment: cannot skip ACCEPTED/EN_ROUTE', () => { expect(canTransition(DEPLOYMENT_TRANSITIONS, 'ASSIGNED', 'COMPLETED')).toBe(false); expect(canTransition(DEPLOYMENT_TRANSITIONS, 'ASSIGNED', 'ON_SITE')).toBe(false); expect(canTransition(DEPLOYMENT_TRANSITIONS, 'ON_SITE', 'COMPLETED')).toBe(true); });
  it('deployment: completed is terminal', () => expect(DEPLOYMENT_TRANSITIONS.COMPLETED).toEqual([]));
});
describe('inventory rules', () => {
  it('signs deltas by movement type', () => { expect(signedDelta('RECEIPT', 10)).toBe(10); expect(signedDelta('DISTRIBUTION', 10)).toBe(-10); expect(signedDelta('DAMAGED', 3)).toBe(-3); expect(signedDelta('TRANSFER_OUT', 4)).toBe(-4); expect(signedDelta('ADJUSTMENT', -7)).toBe(-7); });
  it('rejects unknown types', () => expect(() => signedDelta('NOPE', 1)).toThrow());
  it('never allows more than available, or zero/negative', () => { expect(hasStock(10, 10)).toBe(true); expect(hasStock(10, 11)).toBe(false); expect(hasStock(10, 0)).toBe(false); expect(hasStock(10, -1)).toBe(false); });
});
describe('shelter capacity', () => {
  it('flips to FULL at capacity and back', () => { expect(shelterStatusFor(5, 5, 'ACTIVE')).toBe('FULL'); expect(shelterStatusFor(4, 5, 'ACTIVE')).toBe('ACTIVE'); });
  it('never overrides CLOSED/UNAVAILABLE', () => { expect(shelterStatusFor(0, 5, 'CLOSED')).toBe('CLOSED'); expect(shelterStatusFor(9, 5, 'TEMPORARILY_UNAVAILABLE')).toBe('TEMPORARILY_UNAVAILABLE'); });
});
describe('permission catalog', () => {
  it('every role permission exists in the catalog', () => { for (const r of ROLES) for (const p of r.permissions) expect(PERMISSIONS).toHaveProperty([p]); });
  it('exec viewer has no write permission', () => { const w = ROLES.find(r => r.key === 'EXEC_VIEWER')!.permissions.filter(p => /create|manage|assign|verify|reject|approve|update|record|close|publish|draft/.test(p)); expect(w).toEqual([]); });
  it('LGA officer is scope-required', () => expect(ROLES.find(r => r.key === 'LGA_OFFICER')!.scopeRequired).toBe(true));
  it('seeds exactly 21 LGAs', () => { expect(KOGI_LGAS).toHaveLength(21); expect(new Set(KOGI_LGAS).size).toBe(21); });
});
describe('upload validation (magic bytes, not declared MIME)', () => {
  const s = new StorageService();
  const f = (b: Buffer, mimetype = 'image/jpeg') => ({ buffer: b, size: b.length, mimetype, originalname: 'x' });
  it('accepts JPEG/PNG/PDF', () => { expect(s.validate(f(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).mime).toBe('image/jpeg'); expect(s.validate(f(Buffer.from('%PDF-1.4'))).mime).toBe('application/pdf'); });
  it('rejects an executable claiming to be an image', () => expect(() => s.validate(f(Buffer.from('MZ\x90\x00')))).toThrow(BadRequestException));
  it('rejects oversize', () => expect(() => s.validate({ ...f(Buffer.from([0xff, 0xd8, 0xff])), size: 26 * 1024 * 1024 })).toThrow(BadRequestException));
  it('rejects empty', () => expect(() => s.validate(f(Buffer.alloc(0)))).toThrow(BadRequestException));
});
