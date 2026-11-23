'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertOctagon, Boxes, CheckCircle2, Clock, Inbox, Siren, Tent, Truck, Users, UserX, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ago, fmtDate, fmtMinutes, fmtNum, humanize } from '@/lib/format';
import type { Lga, MapIncident, Overview } from '@/lib/types';
import { Card, CardHeader, EmptyState, ErrorState, FilterDate, FilterSelect, PageHeader, SeverityBadge, Skeleton, Stat, StatusBadge, FilterBar } from '@/components/ui';
import { useListState } from '@/lib/hooks';

const CommandMap = dynamic(() => import('@/components/maps/command-map').then(m => m.CommandMap), { ssr: false, loading: () => <Skeleton className="h-[360px]" /> });

export default function Dashboard() {
  const { me } = useAuth(); const f = useListState({}); const [sel, setSel] = useState<MapIncident | null>(null);
  const p = { from: f.state.from, to: f.state.to, lgaId: f.state.lgaId };
  const ov = useQuery({ queryKey: ['dashboard', 'overview', p], queryFn: () => api.get<Overview>('/dashboard/overview', p) });
  const sum = useQuery({ queryKey: ['dashboard', 'incident-summary', p.lgaId], queryFn: () => api.get<any>('/dashboard/incident-summary', { lgaId: p.lgaId }), enabled: can(me, 'incidents.read') });
  const resp = useQuery({ queryKey: ['dashboard', 'response'], queryFn: () => api.get<any>('/dashboard/response-summary'), enabled: can(me, 'deployments.read') });
  const act = useQuery({ queryKey: ['dashboard', 'activity'], queryFn: () => api.get<any>('/dashboard/recent-activity') });
  const map = useQuery({ queryKey: ['map', 'incidents', { lgaId: p.lgaId }], queryFn: () => api.get<{ data: MapIncident[] }>('/map/incidents', { lgaId: p.lgaId }), enabled: can(me, 'map.read', 'incidents.read') });
  const lgas = useQuery({ queryKey: ['lgas'], queryFn: () => api.get<{ data: Lga[] }>('/geography/lgas') });
  const m = ov.data?.metrics; const perf = ov.data?.performance;
  const metrics: [string, any, any, any?, string?][] = m ? [
    ['Total incidents', m.totalIncidents, Siren, 'navy'], ['Active incidents', m.activeIncidents, Activity, 'warn'], ['Critical incidents', m.criticalIncidents, AlertOctagon, 'crit'], ['Awaiting verification', m.reportsAwaitingVerification, Inbox, 'warn'],
    ['Active deployments', m.activeDeployments, Truck, 'navy'], ['Available teams', m.availableTeams, Users, 'ok'], ['Affected persons', m.affectedPersons, Home, 'navy', 'Registered households only'], ['Displaced persons', m.displacedPersons, UserX, 'navy', 'Registered households only'],
    ['Active shelters', m.activeShelters, Tent, 'ok'], ['Pending allocations', m.pendingAllocations, Boxes, 'warn'],
  ] as any : [];
  return <div>
    <PageHeader title="Command Centre" sub={ov.data ? `Data as of ${fmtDate(ov.data.generatedAt)}${me?.statewide ? ' · statewide' : ' · your authorised scope'}` : 'Loading operational picture…'} />
    {ov.data?.containsDemoData && <p role="note" className="mb-4 rounded-md border border-gold/40 bg-gold-50 px-3 py-2 text-sm font-semibold text-gold-600">DEMO — this environment contains fictional records for demonstration. They are not KOSEMA data.</p>}
    <Card className="mb-5"><FilterBar active={f.active} onClear={f.reset}><FilterDate label="From" value={f.state.from} onChange={v => f.setFilter('from', v)} /><FilterDate label="To" value={f.state.to} onChange={v => f.setFilter('to', v)} />
      {me?.statewide && <FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={(lgas.data?.data ?? []).map(l => ({ value: l.id, label: l.name }))} />}
      <p className="pb-2 text-xs text-muted">Date filters apply to incident metrics.</p></FilterBar></Card>
    {ov.error ? <Card><ErrorState error={ov.error} retry={() => ov.refetch()} /></Card> :
      <section aria-label="Emergency overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{ov.isLoading ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />) : metrics.map(([l, v, I, tone, sub]) => <Stat key={l} label={l} value={fmtNum(v)} icon={I} tone={tone as any} sub={sub} />)}</section>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card><CardHeader title="Live incident map" sub="Cluster markers; critical incidents are ringed" action={<Link href="/map" className="text-xs font-semibold text-info">Open full map →</Link>} />
        <div className="p-3"><CommandMap height={360} incidents={map.data?.data ?? []} layers={{ incidents: true, teams: false, shelters: false, warehouses: false, boundaries: true }} onSelect={setSel} />
          {sel && <p className="mt-2 text-sm"><b>{sel.ref}</b> — {sel.title} · <SeverityBadge severity={sel.severity} /> · <Link className="font-semibold text-info" href={`/incidents/${sel.id}`}>Open</Link></p>}</div></Card>
      <Card><CardHeader title="Active emergencies" sub="Critical and high severity first" action={<Link href="/incidents?active=true" className="text-xs font-semibold text-info">All →</Link>} />
        {sum.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div> : sum.data?.activeIncidents.length ? <ul className="divide-y divide-line">{sum.data.activeIncidents.map((i: any) => <li key={i.id}><Link href={`/incidents/${i.id}`} className="flex items-start justify-between gap-2 px-4 py-2.5 hover:bg-navy-50"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{i.title}</p><p className="text-xs text-muted">{i.ref} · {i.lga} · {ago(i.createdAt)}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></div></Link></li>)}</ul> : <EmptyState title="No active incidents" hint="Verified incidents that are open or in response appear here." />}</Card></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <Card><CardHeader title="Incoming reports" sub="Awaiting verification — urgent, then oldest first" action={<Link href="/reports?queue=1" className="text-xs font-semibold text-info">Queue →</Link>} />
        {sum.data?.incomingReports?.length ? <ul className="divide-y divide-line">{sum.data.incomingReports.map((r: any) => <li key={r.id}><Link href={`/reports/${r.id}`} className="block px-4 py-2.5 hover:bg-navy-50"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{r.ref}</p><SeverityBadge severity={r.severity} /></div><p className="truncate text-xs text-muted">{r.category} · {r.lga} · {ago(r.submittedAt)}</p></Link></li>)}</ul> : <EmptyState title="Queue is clear" hint="No reports are waiting for verification." />}</Card>
      <Card><CardHeader title="Response operations" sub="Active deployments" action={<Link href="/deployments?active=true" className="text-xs font-semibold text-info">All →</Link>} />
        {resp.data?.deployments?.length ? <ul className="divide-y divide-line">{resp.data.deployments.map((d: any) => <li key={d.id}><Link href={`/deployments/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-50"><div className="min-w-0"><p className="truncate text-sm font-semibold">{d.team}</p><p className="truncate text-xs text-muted">{d.ref} → {d.incident}</p></div><StatusBadge status={d.status} /></Link></li>)}</ul> : <EmptyState title="No active deployments" />}</Card>
      <Card><CardHeader title="Recent activity" />{act.data?.data?.length ? <ul className="max-h-80 divide-y divide-line overflow-auto">{act.data.data.map((a: any) => <li key={a.id} className="px-4 py-2.5"><p className="text-sm">{a.text}</p><p className="text-xs text-muted"><Link href={`/incidents/${a.incidentId}`} className="font-semibold text-info">{a.incidentRef}</Link> · {humanize(a.type)} · {ago(a.at)}</p></li>)}</ul> : <EmptyState title="No recent activity" />}</Card></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Card><CardHeader title="Operational performance" sub="Computed from recorded timestamps" /><dl className="grid grid-cols-2 gap-4 p-4">
        {[['Avg verification time', fmtMinutes(perf?.avgVerificationMinutes), Clock], ['Avg dispatch time', fmtMinutes(perf?.avgDispatchMinutes), Truck], ['Avg response time', fmtMinutes(perf?.avgResponseMinutes), Activity], ['Incidents resolved', fmtNum(perf?.incidentsResolved), CheckCircle2]].map(([k, v, I]: any) => <div key={k} className="flex items-start gap-2"><I className="mt-0.5 h-4 w-4 text-gold-600" aria-hidden /><div><dt className="text-xs font-semibold text-muted">{k}</dt><dd className="font-display text-xl text-navy">{v}</dd></div></div>)}</dl>
        <div className="border-t border-line px-4 py-3"><p className="mb-1 text-xs font-semibold uppercase text-muted">Open incidents by severity</p><div className="flex flex-wrap gap-2">{perf?.openBySeverity.length ? perf.openBySeverity.map(s => <span key={s.severity} className="inline-flex items-center gap-1"><SeverityBadge severity={s.severity} /><b>{s.count}</b></span>) : <span className="text-sm text-muted">None open</span>}</div></div></Card>
      <Card><CardHeader title="Incidents by LGA" sub="Geographic distribution" />{ov.data?.byLga.length ? <div className="h-64 p-3" role="img" aria-label="Bar chart of incident counts by LGA"><ResponsiveContainer width="100%" height="100%"><BarChart data={ov.data.byLga} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#D9E2EE" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#13315C" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No incidents in this period" />}</Card></div></div>;
}
