/** Central typed API client. All network access goes through `api` — components never call fetch directly. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any, public requestId?: string) { super(message); this.name = 'ApiError'; }
  get fieldErrors(): Record<string, string[]> { return this.details?.fieldErrors ?? {}; }
}

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onAuthLost: (() => void) | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const onSessionLost = (fn: () => void) => { onAuthLost = fn; };

async function parse(res: Response) {
  const text = await res.text(); let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) { const e = body?.error ?? {}; throw new ApiError(res.status, e.code ?? 'HTTP_' + res.status, e.message ?? res.statusText, e.details, e.requestId); }
  return body;
}

/** Single-flight silent refresh using the httpOnly refresh cookie (+ CSRF header). */
export function refreshSession(): Promise<string | null> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'kodems-web' } })
    .then(parse).then(b => { accessToken = b.accessToken; return accessToken; }).catch(() => { accessToken = null; return null; }).finally(() => { refreshing = null; });
  return refreshing;
}

export interface ReqOpts { method?: string; body?: unknown; query?: Record<string, any>; idempotencyKey?: string; raw?: boolean; signal?: AbortSignal }
export async function request<T = any>(path: string, o: ReqOpts = {}): Promise<T> {
  const url = new URL(API_URL + path);
  Object.entries(o.query ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const send = () => fetch(url, { method: o.method ?? 'GET', credentials: 'include', signal: o.signal,
    headers: { ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(o.idempotencyKey ? { 'Idempotency-Key': o.idempotencyKey } : {}) },
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  let res: Response;
  try { res = await send(); } catch (e: any) { if (e?.name === 'AbortError') throw e; throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and retry.'); }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const t = await refreshSession();
    if (!t) { onAuthLost?.(); throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.'); }
    res = await send();
  }
  if (o.raw) { if (!res.ok) await parse(res); return res as any; }
  return parse(res);
}

const q = (query?: Record<string, any>) => ({ query });
export const idem = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export const api = {
  get: <T = any>(p: string, query?: Record<string, any>, signal?: AbortSignal) => request<T>(p, { ...q(query), signal }),
  post: <T = any>(p: string, body: unknown = {}, opts: Partial<ReqOpts> = {}) => request<T>(p, { method: 'POST', body, ...opts }),
  patch: <T = any>(p: string, body: unknown = {}) => request<T>(p, { method: 'PATCH', body }),
  auth: {
    login: (email: string, password: string, mfaCode?: string) => request<{ accessToken: string; mfaEnrolmentRequired: boolean }>('/auth/login', { method: 'POST', body: { email, password, mfaCode } }),
    logout: () => fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'kodems-web' } }),
    me: () => request<import('./types').Me>('/auth/me'),
    mfaSetup: () => request<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST' }),
    mfaEnable: (code: string) => request('/auth/mfa/enable', { method: 'POST', body: { code } }),
    forgot: (email: string) => request<{ devToken?: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),
    reset: (token: string, password: string) => request('/auth/reset-password', { method: 'POST', body: { token, password } }),
  },
  download: async (path: string, query: Record<string, any>, filename: string) => {
    const res: Response = await request(path, { query, raw: true }); const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  },
};
