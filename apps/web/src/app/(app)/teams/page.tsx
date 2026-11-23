'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Button, Card, Col, DataTable, DemoTag, FilterBar, FilterSearch, FilterSelect, FormDialog, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { opts, useAct, useCategories, useLgas, useList, useListState } from '@/lib/hooks';

export default function Teams() {
  const { me } = useAuth(); const router = useRouter(); const f = useListState({}); const [create, setCreate] = useState(false);
  const list = useList<any>('teams', '/teams', f.state); const lgas = useLgas(); const cats = useCategories('TEAM');
  const add = useAct((v: any) => api.post('/teams', { ...v, capabilities: String(v.capabilities ?? '').split(',').map((s: string) => s.trim()).filter(Boolean) }), { ok: 'Team created', invalidate: ['teams'], onDone: () => setCreate(false) });
  const cols: Col<any>[] = [{ key: 'n', header: 'Team', render: r => <><span className="font-semibold text-navy">{r.name}</span>{r.isDemo && <DemoTag />}<span className="block text-xs text-muted">{r.code}</span></> }, { key: 'c', header: 'Category', render: r => r.category }, { key: 'a', header: 'Agency', render: r => r.agency }, { key: 'l', header: 'Base LGA', render: r => r.lga },
    { key: 's', header: 'Status', render: r => <StatusBadge status={r.status} /> }, { key: 'cap', header: 'Capabilities', render: r => r.capabilities.join(', ') || '—' }, { key: 'm', header: 'Members', render: r => r.memberCount }];
  return <div><PageHeader title="Response teams" sub="Configurable team classifications — not assertions about confirmed KOSEMA teams." actions={can(me, 'teams.manage') && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />New team</Button>} />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Team name or code" />
      <FilterSelect label="Status" value={f.state.status} onChange={v => f.setFilter('status', v)} options={['AVAILABLE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE'].map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} />
      <FilterSelect label="Category" value={f.state.categoryKey} onChange={v => f.setFilter('categoryKey', v)} options={(cats.data?.data ?? []).map(c => ({ value: c.key, label: c.label }))} /><FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={opts(lgas.data?.data)} />
      <div><label className="label">Capability</label><input className="input py-1.5" onChange={e => f.setFilter('capability', e.target.value)} placeholder="e.g. boat" /></div></FilterBar>
      <DataTable caption="Response teams" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} onRow={r => router.push(`/teams/${r.id}`)} /><Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <FormDialog wide open={create} onClose={() => setCreate(false)} title="Create response team" loading={add.isPending} onSubmit={v => add.mutateAsync(v)} fields={[{ name: 'name', label: 'Team name', required: true, minLength: 3 }, { name: 'categoryId', label: 'Category', type: 'select', required: true, options: opts(cats.data?.data) }, { name: 'agency', label: 'Agency / organisation', required: true, minLength: 2 }, { name: 'lgaId', label: 'Base LGA', type: 'select', required: true, options: opts(lgas.data?.data) },
      { name: 'baseLat', label: 'Base latitude', type: 'number' }, { name: 'baseLng', label: 'Base longitude', type: 'number' }, { name: 'contact', label: 'Contact' }, { name: 'capabilities', label: 'Capabilities (comma separated)' }]} /></div>;
}
