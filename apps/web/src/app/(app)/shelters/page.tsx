'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Button, Card, Col, DataTable, DemoTag, FilterBar, FilterSearch, FilterSelect, FormDialog, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { opts, useAct, useLgas, useList, useListState } from '@/lib/hooks';

export default function Shelters() {
  const { me } = useAuth(); const router = useRouter(); const f = useListState({}); const [create, setCreate] = useState(false); const lgas = useLgas(); const list = useList<any>('shelters', '/shelters', f.state);
  const add = useAct((v: any) => api.post('/shelters', { ...v, facilities: String(v.facilities ?? '').split(',').map((s: string) => s.trim()).filter(Boolean) }), { ok: 'Shelter registered', invalidate: ['shelters', 'map'], onDone: () => setCreate(false) });
  const cols: Col<any>[] = [{ key: 'n', header: 'Shelter', render: r => <><span className="font-semibold text-navy">{r.name}</span>{r.isDemo && <DemoTag />}<span className="block text-xs text-muted">{r.code}</span></> }, { key: 'l', header: 'LGA', render: r => r.lga }, { key: 's', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'o', header: 'Occupancy', render: r => <div className="w-40"><p className="text-xs"><b>{r.occupancy}</b> / {r.capacity} <span className="text-muted">({r.available} free)</span></p><div className="mt-1 h-2 rounded bg-navy-100" role="progressbar" aria-valuenow={r.occupancy} aria-valuemax={r.capacity} aria-label="Occupancy"><div className={`h-2 rounded ${r.occupancy >= r.capacity ? 'bg-crit' : r.occupancy / r.capacity > 0.8 ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${Math.min(100, (r.occupancy / r.capacity) * 100)}%` }} /></div></div> }, { key: 'sh', header: 'Shortages', render: r => r.shortages || '—' }];
  return <div><PageHeader title="Evacuation centres" sub="Historical shelter data must be verified before production import." actions={can(me, 'shelters.manage') && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />Register shelter</Button>} />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} /><FilterSelect label="Status" value={f.state.status} onChange={v => f.setFilter('status', v)} options={['ACTIVE', 'FULL', 'TEMPORARILY_UNAVAILABLE', 'CLOSED'].map(s => ({ value: s, label: s.replace('_', ' ').toLowerCase() }))} /><FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={opts(lgas.data?.data)} /></FilterBar>
      <DataTable caption="Shelters" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} onRow={r => router.push(`/shelters/${r.id}`)} /><Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <FormDialog wide open={create} onClose={() => setCreate(false)} title="Register shelter" onSubmit={v => add.mutateAsync(v)} loading={add.isPending} fields={[{ name: 'name', label: 'Name', required: true, minLength: 3 }, { name: 'lgaId', label: 'LGA', type: 'select', required: true, options: opts(lgas.data?.data) }, { name: 'capacity', label: 'Capacity', type: 'number', required: true, min: 1 }, { name: 'ward', label: 'Ward' }, { name: 'lat', label: 'Latitude', type: 'number' }, { name: 'lng', label: 'Longitude', type: 'number' }, { name: 'facilities', label: 'Facilities (comma separated)' }, { name: 'accessibility', label: 'Accessibility information' }, { name: 'contactPerson', label: 'Contact person' }, { name: 'contactPhone', label: 'Contact phone' }]} /></div>;
}
