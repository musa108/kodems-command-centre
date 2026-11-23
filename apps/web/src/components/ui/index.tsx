'use client';
import * as React from 'react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock, Inbox, Loader2, X, ArrowUp, ArrowDown, Flame, Siren, ShieldAlert, Info, CircleDot, Ban, Copy, Eye } from 'lucide-react';
import { humanize } from '@/lib/format';

/* ── Buttons ── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'; size?: 'sm' | 'md'; loading?: boolean };
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={clsx('inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap', size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
    { primary: 'bg-navy text-white hover:bg-navy-700', secondary: 'bg-white text-navy border border-line hover:bg-navy-50', danger: 'bg-crit text-white hover:bg-[#8F1C12]', ghost: 'text-navy hover:bg-navy-50', gold: 'bg-gold text-white hover:bg-gold-600' }[variant], className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>));
Button.displayName = 'Button';

/* ── Status & severity badges: never colour alone (icon + text) ── */
const SEV = { CRITICAL: ['bg-crit-bg text-crit border-crit/30', Siren], HIGH: ['bg-warn-bg text-warn border-warn/30', Flame], MODERATE: ['bg-gold-50 text-gold-600 border-gold/40', ShieldAlert], LOW: ['bg-ok-bg text-ok border-ok/30', Info] } as const;
export function SeverityBadge({ severity }: { severity?: string }) {
  const [cls, Icon] = (SEV as any)[severity ?? ''] ?? ['bg-navy-50 text-muted border-line', CircleDot];
  return <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', cls)}><Icon className="h-3 w-3" aria-hidden />{humanize(severity)}</span>;
}
const ST: Record<string, [string, any]> = {
  SUBMITTED: ['bg-info-bg text-info', Inbox], UNDER_REVIEW: ['bg-warn-bg text-warn', Eye], VERIFIED: ['bg-ok-bg text-ok', CheckCircle2], DUPLICATE: ['bg-navy-50 text-muted', Copy], REJECTED: ['bg-crit-bg text-crit', Ban],
  OPEN: ['bg-info-bg text-info', CircleDot], ASSESSMENT: ['bg-warn-bg text-warn', Eye], RESPONSE_ACTIVE: ['bg-crit-bg text-crit', Siren], RECOVERY: ['bg-gold-50 text-gold-600', Clock], RESOLVED: ['bg-ok-bg text-ok', CheckCircle2], CLOSED: ['bg-navy-50 text-muted', CheckCircle2],
  ASSIGNED: ['bg-info-bg text-info', Clock], ACCEPTED: ['bg-info-bg text-info', CheckCircle2], EN_ROUTE: ['bg-warn-bg text-warn', Clock], ON_SITE: ['bg-warn-bg text-warn', CircleDot], COMPLETED: ['bg-ok-bg text-ok', CheckCircle2], CANCELLED: ['bg-navy-50 text-muted', Ban], REASSIGNED: ['bg-navy-50 text-muted', Ban],
  AVAILABLE: ['bg-ok-bg text-ok', CheckCircle2], DEPLOYED: ['bg-warn-bg text-warn', Clock], UNAVAILABLE: ['bg-navy-50 text-muted', Ban], MAINTENANCE: ['bg-gold-50 text-gold-600', Clock],
  ACTIVE: ['bg-ok-bg text-ok', CheckCircle2], FULL: ['bg-crit-bg text-crit', CircleAlert], TEMPORARILY_UNAVAILABLE: ['bg-warn-bg text-warn', Clock],
  DRAFT: ['bg-navy-50 text-muted', Clock], PENDING_APPROVAL: ['bg-warn-bg text-warn', Clock], APPROVED: ['bg-info-bg text-info', CheckCircle2], PUBLISHED: ['bg-ok-bg text-ok', CheckCircle2], EXPIRED: ['bg-navy-50 text-muted', Clock], FULFILLED: ['bg-ok-bg text-ok', CheckCircle2],
  UP: ['bg-ok-bg text-ok', CheckCircle2], DOWN: ['bg-crit-bg text-crit', CircleAlert], UNKNOWN: ['bg-navy-50 text-muted', Info], INTEGRATION_PENDING: ['bg-gold-50 text-gold-600', Clock], CONFIGURED: ['bg-ok-bg text-ok', CheckCircle2], NOT_CONFIGURED: ['bg-gold-50 text-gold-600', Clock], SENT: ['bg-ok-bg text-ok', CheckCircle2],
};
export function StatusBadge({ status }: { status?: string }) {
  const [cls, Icon] = ST[status ?? ''] ?? ['bg-navy-50 text-muted', CircleDot];
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', cls)}><Icon className="h-3 w-3" aria-hidden />{humanize(status)}</span>;
}
export const DemoTag = () => <span title="Fictional demonstration record" className="ml-1.5 rounded border border-gold/50 bg-gold-50 px-1 text-[10px] font-bold uppercase tracking-wide text-gold-600">Demo</span>;

/* ── Layout atoms ── */
export const Card = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={clsx('card', className)} {...p}>{children}</div>;
export const CardHeader = ({ title, action, sub }: { title: React.ReactNode; action?: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><h2 className="text-sm font-semibold text-navy">{title}</h2>{sub && <p className="text-xs text-muted">{sub}</p>}</div>{action}</div>);
export const PageHeader = ({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="h1">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div><div className="flex flex-wrap gap-2">{actions}</div></div>);
export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('relative overflow-hidden rounded bg-navy-100', className)} aria-hidden><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" /></div>;
export const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><div className="rounded-full bg-navy-50 p-3"><Inbox className="h-5 w-5 text-navy-500" aria-hidden /></div><p className="font-semibold text-navy">{title}</p>{hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}{action}</div>);
export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center"><AlertTriangle className="h-6 w-6 text-crit" aria-hidden /><p className="font-semibold text-crit">Could not load this data</p><p className="max-w-md text-sm text-muted">{(error as any)?.message ?? 'Unexpected error'}</p>{retry && <Button variant="secondary" size="sm" onClick={retry}>Retry</Button>}</div>);
export const Stat = ({ label, value, sub, tone = 'navy', icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'navy' | 'crit' | 'warn' | 'ok'; icon?: any }) => (
  <div className="card p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>{Icon && <Icon className={clsx('h-4 w-4', { navy: 'text-navy-500', crit: 'text-crit', warn: 'text-warn', ok: 'text-ok' }[tone])} aria-hidden />}</div>
    <p className={clsx('mt-1 font-display text-3xl font-semibold', { navy: 'text-navy', crit: 'text-crit', warn: 'text-warn', ok: 'text-ok' }[tone])}>{value}</p>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>);
export const KV = ({ k, children }: { k: string; children: React.ReactNode }) => <div><dt className="text-xs font-semibold text-muted">{k}</dt><dd className="mt-0.5 text-sm">{children || '—'}</dd></div>;
export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">{tabs.map(t => <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} className={clsx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', value === t.key ? 'border-gold text-navy' : 'border-transparent text-muted hover:text-navy')}>{t.label}</button>)}</div>;
}

/* ── Dialog (focus-trapped, Esc to close) ── */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return; const prev = document.activeElement as HTMLElement | null; const el = ref.current;
    el?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab' && el) { const f = [...el.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.hasAttribute('disabled')); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4 sm:pt-16" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('card w-full animate-fade bg-white', wide ? 'max-w-2xl' : 'max-w-lg')}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-display text-lg font-semibold text-navy">{title}</h2><button data-close onClick={onClose} aria-label="Close dialog" className="rounded p-1 text-muted hover:bg-navy-50"><X className="h-4 w-4" /></button></div>
      <div className="p-4">{children}</div></div></div>;
}
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return <Dialog open={open} onClose={onClose} title={title}><div className="text-sm text-ink">{message}</div><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div></Dialog>;
}

/* ── Schema-driven forms: react-hook-form + zod, accessible labels, inline errors ── */
export interface FieldDef { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'datetime' | 'checkbox'; options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; hint?: string; min?: number; max?: number; minLength?: number; initial?: any }
export function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    if (f.type === 'number') { let n = z.coerce.number({ invalid_type_error: `${f.label} must be a number` }); if (f.min !== undefined) n = n.min(f.min); if (f.max !== undefined) n = n.max(f.max); s = f.required ? n : z.preprocess(v => v === '' || v == null ? undefined : v, n.optional()); }
    else if (f.type === 'checkbox') s = z.boolean().default(false);
    else { let t = z.string(); if (f.minLength) t = t.min(f.minLength, `At least ${f.minLength} characters`); s = f.required ? t.trim().min(1, `${f.label} is required`).pipe(t) : z.string().optional().transform(v => v === '' ? undefined : v); }
    shape[f.name] = s;
  }
  return z.object(shape);
}
export function Field({ f, form, err }: { f: FieldDef; form: any; err?: string }) {
  const id = `f-${f.name}`; const reg = form.register(f.name);
  const common = { id, 'aria-invalid': !!err, 'aria-describedby': err ? id + '-e' : undefined, ...reg, className: 'input', placeholder: f.placeholder };
  return <div><label htmlFor={id} className="label">{f.label}{f.required && <span className="text-crit" aria-hidden> *</span>}</label>
    {f.type === 'textarea' ? <textarea rows={3} {...common} /> : f.type === 'select' ? <select {...common}><option value="">Select…</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : f.type === 'checkbox' ? <input type="checkbox" id={id} {...reg} className="h-4 w-4" /> : <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'} step={f.type === 'number' ? 'any' : undefined} {...common} />}
    {f.hint && !err && <p className="mt-1 text-xs text-muted">{f.hint}</p>}{err && <p id={id + '-e'} role="alert" className="mt-1 text-xs font-medium text-crit">{err}</p>}</div>;
}
export function FormDialog({ open, onClose, title, fields, submitLabel = 'Save', onSubmit, loading, wide, serverErrors, children }: { open: boolean; onClose: () => void; title: string; fields: FieldDef[]; submitLabel?: string; onSubmit: (v: any) => void | Promise<any>; loading?: boolean; wide?: boolean; serverErrors?: Record<string, string[]>; children?: React.ReactNode }) {
  const schema = React.useMemo(() => buildSchema(fields), [fields]);
  const form = useForm<any>({ resolver: zodResolver(schema), defaultValues: Object.fromEntries(fields.map(f => [f.name, f.initial ?? (f.type === 'checkbox' ? false : '')])) });
  React.useEffect(() => { if (open) form.reset(Object.fromEntries(fields.map(f => [f.name, f.initial ?? (f.type === 'checkbox' ? false : '')]))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const errs = form.formState.errors as Record<string, any>;
  return <Dialog open={open} onClose={onClose} title={title} wide={wide}>
    <form noValidate onSubmit={form.handleSubmit(async v => { await onSubmit(v); })} className="space-y-3">
      <div className={clsx('grid gap-3', wide && 'sm:grid-cols-2')}>{fields.map(f => <div key={f.name} className={clsx(f.type === 'textarea' && wide && 'sm:col-span-2')}><Field f={f} form={form} err={errs[f.name]?.message ?? serverErrors?.[f.name]?.[0]} /></div>)}</div>
      {children}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={loading || form.formState.isSubmitting}>{submitLabel}</Button></div></form></Dialog>;
}

/* ── Data table: server-side sort/pagination, loading/empty/error states ── */
export interface Col<T> { key: string; header: string; render: (r: T) => React.ReactNode; sort?: string; className?: string }
export function DataTable<T extends { id: string }>({ cols, rows, loading, error, retry, sort, dir, onSort, onRow, empty, caption }: { cols: Col<T>[]; rows?: T[]; loading?: boolean; error?: unknown; retry?: () => void; sort?: string; dir?: string; onSort?: (k: string) => void; onRow?: (r: T) => void; empty?: React.ReactNode; caption?: string }) {
  if (error) return <ErrorState error={error} retry={retry} />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse">{caption && <caption className="sr-only">{caption}</caption>}
    <thead><tr>{cols.map(c => <th key={c.key} scope="col" className="th" aria-sort={sort === c.sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {c.sort && onSort ? <button className="inline-flex items-center gap-1 uppercase" onClick={() => onSort(c.sort!)}>{c.header}{sort === c.sort && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button> : c.header}</th>)}</tr></thead>
    <tbody>{loading && !rows?.length ? Array.from({ length: 6 }).map((_, i) => <tr key={i}>{cols.map(c => <td key={c.key} className="td"><Skeleton className="h-4 w-full" /></td>)}</tr>)
      : rows?.length ? rows.map(r => <tr key={r.id} className={clsx('hover:bg-navy-50/60', onRow && 'cursor-pointer')} onClick={() => onRow?.(r)} onKeyDown={e => { if (onRow && e.key === 'Enter') onRow(r); }} tabIndex={onRow ? 0 : undefined}>{cols.map(c => <td key={c.key} className={clsx('td', c.className)}>{c.render(r)}</td>)}</tr>)
      : <tr><td colSpan={cols.length}>{empty ?? <EmptyState title="Nothing to show" hint="No records match the current filters." />}</td></tr>}</tbody></table></div>;
}
export function Pagination({ meta, onPage }: { meta?: { total: number; page: number; pages: number; pageSize: number }; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null; const from = (meta.page - 1) * meta.pageSize + 1, to = Math.min(meta.total, meta.page * meta.pageSize);
  return <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted"><span>{from}–{to} of {meta.total}</span>
    <div className="flex items-center gap-1"><Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft className="h-3 w-3" /></Button><span className="px-2">Page {meta.page} / {meta.pages}</span><Button size="sm" variant="secondary" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight className="h-3 w-3" /></Button></div></nav>;
}
export function FilterBar({ children, onClear, active }: { children: React.ReactNode; onClear?: () => void; active?: number }) {
  return <div className="flex flex-wrap items-end gap-3 border-b border-line bg-navy-50/50 px-3 py-3">{children}{!!active && onClear && <Button variant="ghost" size="sm" onClick={onClear}>Clear filters ({active})</Button>}</div>;
}
export const FilterSelect = ({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <div className="min-w-[140px]"><label className="label">{label}</label><select className="input py-1.5" value={value ?? ''} onChange={e => onChange(e.target.value)}><option value="">All</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>);
export const FilterSearch = ({ value, onChange, placeholder = 'Search…' }: { value?: string; onChange: (v: string) => void; placeholder?: string }) => {
  const [v, setV] = React.useState(value ?? ''); React.useEffect(() => setV(value ?? ''), [value]); React.useEffect(() => { const t = setTimeout(() => { if (v !== (value ?? '')) onChange(v); }, 350); return () => clearTimeout(t); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="min-w-[200px] flex-1"><label className="label">Search</label><input className="input py-1.5" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} /></div>;
};
export const FilterDate = ({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) => (<div><label className="label">{label}</label><input type="date" className="input py-1.5" value={value ?? ''} onChange={e => onChange(e.target.value)} /></div>);
