'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import type { Category, Lga, MapIncident } from '@/lib/types';
import { Card, FilterBar, FilterDate, FilterSearch, FilterSelect, PageHeader, Skeleton, SeverityBadge } from '@/components/ui';
import { useListState } from '@/lib/hooks';

const CommandMap = dynamic(() => import('@/components/maps/command-map').then(m => m.CommandMap), { ssr: false, loading: () => <Skeleton className="h-[560px]" /> });
export default function MapPage() {
  const { me } = useAuth(); const f = useListState({}); const [layers, setLayers] = useState({ incidents: true, teams: false, shelters: true, warehouses: false, boundaries: true }); const [sel, setSel] = useState<MapIncident | null>(null);
  const params = { severity: f.state.severity, category: f.state.category, lgaId: f.state.lgaId, status: f.state.status, from: f.state.from, to: f.state.to, q: f.state.q };
  const inc = useQuery({ queryKey: ['map', 'incidents', params], queryFn: () => api.get<{ data: MapIncident[] }>('/map/incidents', params) });
  const teams = useQuery({ queryKey: ['map', 'teams'], queryFn: () => api.get('/map/teams'), enabled: layers.teams && can(me, 'map.teams', 'teams.read') });
  const shelters = useQuery({ queryKey: ['map', 'shelters'], queryFn: () => api.get('/map/shelters'), enabled: layers.shelters && can(me, 'shelters.read') });
  const wh = useQuery({ queryKey: ['map', 'warehouses'], queryFn: () => api.get('/map/warehouses'), enabled: layers.warehouses && can(me, 'relief.inventory.read') });
  const bnd = useQuery({ queryKey: ['map', 'boundaries'], queryFn: () => api.get('/geography/boundaries') });
  const lgas = useQuery({ queryKey: ['lgas'], queryFn: () => api.get<{ data: Lga[] }>('/geography/lgas') }); const cats = useQuery({ queryKey: ['cats', 'INCIDENT'], queryFn: () => api.get<{ data: Category[] }>('/config/categories', { kind: 'INCIDENT' }) });
  const noBoundaries = bnd.data && bnd.data.features.length === 0;
  return <div><PageHeader title="Geospatial intelligence" sub="Incidents, teams, shelters and warehouses within your authorised scope." />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Incident ID or title" />
      <FilterSelect label="Severity" value={f.state.severity} onChange={v => f.setFilter('severity', v)} options={['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} />
      <FilterSelect label="Category" value={f.state.category} onChange={v => f.setFilter('category', v)} options={(cats.data?.data ?? []).map(c => ({ value: c.key, label: c.label }))} />
      <FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={(lgas.data?.data ?? []).map(l => ({ value: l.id, label: l.name }))} />
      <FilterDate label="From" value={f.state.from} onChange={v => f.setFilter('from', v)} /><FilterDate label="To" value={f.state.to} onChange={v => f.setFilter('to', v)} /></FilterBar>
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-2 text-sm" role="group" aria-label="Map layers"><span className="text-xs font-semibold uppercase text-muted">Layers</span>
        {(Object.keys(layers) as (keyof typeof layers)[]).map(k => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={layers[k]} onChange={e => setLayers(l => ({ ...l, [k]: e.target.checked }))} />{k[0].toUpperCase() + k.slice(1)}</label>)}<span className="ml-auto text-xs text-muted">{inc.data?.data.length ?? 0} incidents shown</span></div>
      <div className="grid lg:grid-cols-[1fr_300px]"><div className="p-3"><CommandMap height={560} incidents={inc.data?.data ?? []} teams={teams.data?.data} shelters={shelters.data?.data} warehouses={wh.data?.data} boundaries={bnd.data} layers={layers} onSelect={setSel} />
        {noBoundaries && <p className="mt-2 rounded bg-gold-50 p-2 text-xs text-gold-600">No administrative boundaries are loaded. Import a verified Kogi dataset with <code>npm -w apps/api run boundaries:import</code> (see docs/GEOGRAPHY.md). No placeholder geography is shown.</p>}</div>
        <aside className="border-l border-line p-4" aria-live="polite"><h2 className="text-sm font-semibold text-navy">Selected incident</h2>{sel ? <div className="mt-2 space-y-1 text-sm"><p className="font-semibold">{sel.ref}</p><p>{sel.title}</p><SeverityBadge severity={sel.severity} /><p className="text-muted">{sel.categoryLabel} · {sel.lga}</p><a className="font-semibold text-info" href={`/incidents/${sel.id}`}>Open full record →</a></div> : <p className="mt-2 text-sm text-muted">Select a marker to preview an incident.</p>}</aside></div></Card></div>;
}
