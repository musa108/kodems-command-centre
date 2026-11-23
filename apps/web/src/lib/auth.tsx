'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, onSessionLost, refreshSession, setAccessToken } from './api';
import type { Me } from './types';

interface AuthCtx { me: Me | null; status: 'loading' | 'authed' | 'anon'; login: (email: string, password: string, mfa?: string) => Promise<{ mfaEnrolmentRequired: boolean }>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const [status, setStatus] = useState<AuthCtx['status']>('loading'); const router = useRouter(); const qc = useQueryClient();
  const load = useCallback(async () => { try { setMe(await api.auth.me()); setStatus('authed'); } catch { setMe(null); setStatus('anon'); } }, []);
  useEffect(() => { onSessionLost(() => { setMe(null); setStatus('anon'); qc.clear(); router.replace('/login?expired=1'); }); (async () => { const t = await refreshSession(); if (t) await load(); else setStatus('anon'); })(); }, [load, qc, router]);
  const login: AuthCtx['login'] = useCallback(async (email, password, mfa) => { const r = await api.auth.login(email, password, mfa); setAccessToken(r.accessToken); await load(); return { mfaEnrolmentRequired: r.mfaEnrolmentRequired }; }, [load]);
  const logout = useCallback(async () => { await api.auth.logout().catch(() => undefined); setAccessToken(null); setMe(null); setStatus('anon'); qc.clear(); router.replace('/login'); }, [qc, router]);
  const v = useMemo(() => ({ me, status, login, logout }), [me, status, login, logout]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
