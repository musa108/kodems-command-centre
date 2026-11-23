/** Pure state machines — unit-tested; services call these before any write. */
export type Rec<T extends string> = Record<T, T[]>;

export const REPORT_TRANSITIONS: Rec<any> = {
  SUBMITTED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DUPLICATE'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'DUPLICATE'],
  VERIFIED: [], REJECTED: [], DUPLICATE: [],
};
export const INCIDENT_TRANSITIONS: Rec<any> = {
  OPEN: ['ASSESSMENT', 'RESPONSE_ACTIVE', 'RESOLVED'],
  ASSESSMENT: ['RESPONSE_ACTIVE', 'RESOLVED'],
  RESPONSE_ACTIVE: ['RECOVERY', 'RESOLVED'],
  RECOVERY: ['RESPONSE_ACTIVE', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'RESPONSE_ACTIVE'], // RESOLVED→RESPONSE_ACTIVE only through reopen (reason required)
  CLOSED: ['OPEN'],                          // CLOSED→OPEN only through reopen (reason required)
};
export const DEPLOYMENT_TRANSITIONS: Rec<any> = {
  ASSIGNED: ['ACCEPTED', 'CANCELLED', 'REASSIGNED'],
  ACCEPTED: ['EN_ROUTE', 'CANCELLED', 'REASSIGNED'],
  EN_ROUTE: ['ON_SITE', 'CANCELLED', 'REASSIGNED'],
  ON_SITE: ['COMPLETED', 'CANCELLED', 'REASSIGNED'],
  COMPLETED: [], CANCELLED: [], REASSIGNED: [],
};
export const ACTIVE_DEPLOYMENT = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

export const canTransition = (map: Rec<any>, from: string, to: string) => !!map[from]?.includes(to);

/** Inventory/shelter pure rules */
export const SIGN: Record<string, 1 | -1 | 0> = { RECEIPT: 1, DONATION: 1, PROCUREMENT: 1, TRANSFER_IN: 1, TRANSFER_OUT: -1, DISTRIBUTION: -1, DAMAGED: -1, EXPIRED: -1, ADJUSTMENT: 0 };
export const signedDelta = (type: string, qty: number) => {
  const s = SIGN[type]; if (s === undefined) throw new Error('unknown tx type');
  return s === 0 ? qty : s * Math.abs(qty);
};
export const hasStock = (available: number, requested: number) => requested > 0 && requested <= available;
export const shelterStatusFor = (occupancy: number, capacity: number, current: string) =>
  current === 'CLOSED' || current === 'TEMPORARILY_UNAVAILABLE' ? current : occupancy >= capacity ? 'FULL' : 'ACTIVE';
