'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { useState } from 'react';

/** Server-driven list state: page, sort, filters, search. */
export function useListState(defaults: Record<string, any> = {}) {
  const [state, set] = useState<Record<string, any>>({ page: 1, pageSize: 20, ...defaults });
  const setFilter = (k: string, v: any) => set(s => ({ ...s, [k]: v === '' ? undefined : v, page: k === 'page' ? v : 1 }));
  const reset = () => set({ page: 1, pageSize: 20, ...defaults });
  return { state, setFilter, reset, active: Object.entries(state).filter(([k, v]) => !['page', 'pageSize', 'sort', 'dir'].includes(k) && v !== undefined && v !== '' && defaults[k] !== v).length };
}
export function useList<T = any>(key: string, path: string, params: Record<string, any>, enabled = true) {
  return useQuery({ queryKey: [key, path, params], queryFn: ({ signal }) => api.get<{ data: T[]; meta: any }>(path, params, signal), placeholderData: keepPreviousData, enabled });
}
export function useGet<T = any>(key: string, path: string, params?: Record<string, any>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({ queryKey: [key, path, params], queryFn: ({ signal }) => api.get<T>(path, params, signal), ...opts });
}
export const errMsg = (e: unknown) => e instanceof ApiError ? e.message : 'Something went wrong';
/** Mutation that toasts success/failure and invalidates the given query keys. */
export function useAct<TVars = any, TRes = any>(fn: (v: TVars) => Promise<TRes>, o: { ok?: string | ((r: TRes) => string); invalidate?: string[]; onDone?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { if (o.ok) toast.success(typeof o.ok === 'function' ? o.ok(r) : o.ok); (o.invalidate ?? []).forEach(k => qc.invalidateQueries({ queryKey: [k] })); o.onDone?.(r); }, onError: (e) => toast.error(errMsg(e)) });
}

/* ── shared lookups ── */
export const useLgas = () => useQuery({ queryKey: ['lgas'], queryFn: () => api.get<{ data: { id: string; name: string }[] }>('/geography/lgas'), staleTime: 300_000 });
export const useCategories = (kind: string) => useQuery({ queryKey: ['cats', kind], queryFn: () => api.get<{ data: { id: string; key: string; label: string }[] }>('/config/categories', { kind }), staleTime: 300_000 });
export const useStaff = (permission: string, enabled = true) => useQuery({ queryKey: ['directory', permission], queryFn: () => api.get<{ data: { id: string; name: string }[] }>('/directory/users', { permission }), enabled, staleTime: 120_000 });
export const opts = (rows?: { id: string; name?: string; label?: string }[]) => (rows ?? []).map(r => ({ value: r.id, label: (r.name ?? r.label)! }));
export const SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }));
