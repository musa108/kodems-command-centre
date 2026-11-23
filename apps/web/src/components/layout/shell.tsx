'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bell, ChartColumn, ChevronsLeft, ChevronsRight, House, Inbox, LayoutDashboard, LogOut, Map as MapIcon, Megaphone, Menu, Package, ScrollText, Search, Settings, Siren, Tent, Truck, UserCog, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NAV, can } from '@/lib/permissions';
import { ConnState, createSocket, eventToQueryKeys } from '@/lib/socket';
import { ago, humanize } from '@/lib/format';
import { Skeleton } from '@/components/ui';

const ICONS: Record<string, any> = { 'layout-dashboard': LayoutDashboard, inbox: Inbox, siren: Siren, map: MapIcon, users: Users, truck: Truck, house: House, package: Package, tent: Tent, megaphone: Megaphone, bell: Bell, 'chart-column': ChartColumn, 'user-cog': UserCog, settings: Settings, 'scroll-text': ScrollText, activity: Activity };

export function Logo({ compact }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><div aria-hidden className="grid h-9 w-9 place-items-center rounded-md bg-navy font-display text-lg font-bold text-gold">K</div>
    {!compact && <div className="leading-tight"><p className="font-display text-[15px] font-semibold text-navy">KOSEMA</p><p className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">Command Centre</p></div>}</div>;
}

function ConnectionBadge({ state }: { state: ConnState }) {
  const m = { live: ['Live', 'text-ok', Wifi], connecting: ['Reconnecting…', 'text-warn', Loader2], offline: ['Offline — data may be stale', 'text-crit', WifiOff] }[state] as [string, string, any];
  const I = m[2];
  return <span role="status" className={clsx('hidden items-center gap-1 text-xs font-semibold sm:inline-flex', m[1])} title="Real-time connection"><I className={clsx('h-3.5 w-3.5', state === 'connecting' && 'animate-spin')} aria-hidden />{m[0]}</span>;
}

function GlobalSearch() {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const router = useRouter(); const ref = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ['search', q], queryFn: () => api.get<{ data: { type: string; id: string; label: string; href: string }[] }>('/search', { q }), enabled: q.trim().length >= 2 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <div className="relative w-full max-w-md"><label htmlFor="gs" className="sr-only">Global search</label><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
    <input id="gs" ref={ref} className="input pl-9" placeholder="Search incidents, reports, teams…  (Ctrl+K)" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off" />
    {open && q.trim().length >= 2 && <div className="card absolute left-0 right-0 top-11 z-40 max-h-80 overflow-auto p-1" role="listbox">
      {!data ? <Skeleton className="m-2 h-5" /> : data.data.length === 0 ? <p className="p-3 text-sm text-muted">No matching records you can access.</p> : data.data.map(r => <button key={r.type + r.id} role="option" aria-selected={false} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-navy-50" onMouseDown={() => router.push(r.href)}><span className="w-20 shrink-0 text-[10px] font-bold uppercase text-gold-600">{r.type}</span><span className="truncate">{r.label}</span></button>)}</div>}</div>;
}

function NotificationBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api.get<any>('/notifications', { pageSize: 6 }), refetchInterval: 60000 });
  const [open, setOpen] = useState(false); const qc = useQueryClient(); const router = useRouter();
  const unread = data?.unread ?? 0;
  return <div className="relative"><button className="relative rounded-md p-2 text-navy hover:bg-navy-50" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen(o => !o)}><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-crit px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <div className="card absolute right-0 top-11 z-40 w-80 p-1"><div className="flex items-center justify-between px-3 py-2"><p className="text-sm font-semibold text-navy">Notifications</p><Link href="/notifications" className="text-xs font-semibold text-info" onClick={() => setOpen(false)}>View all</Link></div>
      {data?.data?.length ? data.data.map((n: any) => <button key={n.id} className={clsx('block w-full rounded px-3 py-2 text-left hover:bg-navy-50', !n.readAt && 'bg-gold-50')} onClick={async () => { await api.patch(`/notifications/${n.id}/read`); qc.invalidateQueries({ queryKey: ['notifications'] }); setOpen(false); const href = n.entityType === 'incident' ? `/incidents/${n.entityId}` : n.entityType === 'report' ? `/reports/${n.entityId}` : n.entityType === 'deployment' ? `/deployments/${n.entityId}` : n.entityType === 'shelter' ? `/shelters/${n.entityId}` : '/notifications'; router.push(href); }}>
        <p className="text-sm font-semibold text-ink">{n.title}</p><p className="truncate text-xs text-muted">{n.body}</p><p className="text-[10px] text-muted">{ago(n.createdAt)}</p></button>) : <p className="p-4 text-sm text-muted">You're all caught up.</p>}</div>}</div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, status, logout } = useAuth(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false); const [conn, setConn] = useState<ConnState>('connecting'); const [userMenu, setUserMenu] = useState(false);
  useEffect(() => { if (status === 'anon') router.replace('/login'); }, [status, router]);
  useEffect(() => { setMobile(false); }, [path]);
  useEffect(() => {
    if (status !== 'authed') return;
    let t: any; const pending = new Set<string>();
    const s = createSocket(setConn, (type) => { eventToQueryKeys(type).forEach(k => pending.add(JSON.stringify(k))); clearTimeout(t); t = setTimeout(() => { pending.forEach(k => qc.invalidateQueries({ queryKey: JSON.parse(k) })); pending.clear(); }, 400); }); // coalesce bursts
    s.on('connect', () => qc.invalidateQueries()); // refresh after reconnect: we may have missed events
    return () => { clearTimeout(t); s.close(); };
  }, [status, qc]);
  const nav = useMemo(() => NAV.map(g => ({ ...g, items: g.items.filter(i => !i.perm || can(me, ...i.perm)) })).filter(g => g.items.length), [me]);
  if (status !== 'authed' || !me) return <div className="grid min-h-screen place-items-center"><div className="w-64 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div></div>;
  const crumbs = path.split('/').filter(Boolean); const title = nav.flatMap(g => g.items).find(i => path.startsWith(i.href))?.label ?? humanize(crumbs[0]);
  const Side = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-line px-4"><Logo compact={collapsed} /></div>
      <div className="flex-1 overflow-y-auto px-2 py-3">{nav.map(g => <div key={g.group} className="mb-4">{!collapsed && <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gold-600">{g.group}</p>}
        {g.items.map(i => { const I = ICONS[i.icon]; const on = path === i.href || path.startsWith(i.href + '/'); return <Link key={i.href} href={i.href} title={collapsed ? i.label : undefined} aria-current={on ? 'page' : undefined} className={clsx('relative mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium', on ? 'bg-navy-100 text-navy' : 'text-ink hover:bg-navy-50')}>
          {on && <span className="absolute left-0 top-1.5 h-6 w-1 rounded-r bg-gold" aria-hidden />}<I className="h-4 w-4 shrink-0" aria-hidden />{!collapsed && i.label}</Link>; })}</div>)}</div>
      <div className="border-t border-line p-2"><button onClick={() => setCollapsed(c => !c)} className="hidden w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted hover:bg-navy-50 lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}</button></div>
    </nav>);
  return <div className="min-h-screen">
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
    <aside className={clsx('fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-white lg:block', collapsed ? 'w-[68px]' : 'w-64')}>{Side}</aside>
    {mobile && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy/40" onClick={() => setMobile(false)} /><aside className="absolute inset-y-0 left-0 w-64 bg-white">{Side}</aside></div>}
    <div className={clsx(collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
      {me.environment !== 'production' && <div role="note" className="bg-gold-100 px-4 py-1 text-center text-xs font-semibold text-gold-600">{me.isDemo || me.environment !== 'production' ? `${me.environment.toUpperCase()} ENVIRONMENT — records marked DEMO are fictional and are not government data` : ''}</div>}
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur"><div className="flex h-16 items-center gap-3 px-4">
        <button className="rounded-md p-2 text-navy hover:bg-navy-50 lg:hidden" aria-label="Open menu" onClick={() => setMobile(true)}><Menu className="h-5 w-5" /></button>
        <div className="hidden min-w-0 md:block"><p className="truncate font-display text-base font-semibold text-navy">{title}</p><nav aria-label="Breadcrumb" className="text-[11px] text-muted">KODEMS{crumbs.map((c, i) => <span key={i}> / {humanize(c.length > 20 ? c.slice(0, 8) + '…' : c)}</span>)}</nav></div>
        <div className="mx-auto flex flex-1 justify-center"><GlobalSearch /></div>
        <span className="hidden rounded-full border border-line bg-navy-50 px-3 py-1 text-xs font-semibold text-navy xl:inline" title="Operational scope">{me.statewide ? 'Statewide scope' : `Scope: ${me.scope.map(s => s.name).join(', ')}`}</span>
        <ConnectionBadge state={conn} /><NotificationBell />
        <div className="relative"><button onClick={() => setUserMenu(o => !o)} aria-expanded={userMenu} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-navy-50"><span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">{me.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</span></button>
          {userMenu && <div className="card absolute right-0 top-11 z-40 w-64 p-2"><p className="px-2 text-sm font-semibold text-navy">{me.name}</p><p className="px-2 text-xs text-muted">{me.email}</p><p className="px-2 pb-2 pt-1 text-xs text-gold-600">{me.roles.map(r => r.name).join(', ')}</p>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-crit hover:bg-crit-bg"><LogOut className="h-4 w-4" />Sign out</button></div>}</div>
      </div></header>
      <main id="main" className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
    </div></div>;
}
