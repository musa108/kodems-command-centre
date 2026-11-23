'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ago, fmtNum } from '@/lib/format';
import { Button, Card, Col, DataTable, DemoTag, FilterBar, FilterDate, FilterSearch, FilterSelect, FormDialog, PageHeader, Pagination, SeverityBadge, StatusBadge } from '@/components/ui';
import { opts, SEVERITIES, useAct, useCategories, useLgas, useList, useListState } from '@/lib/hooks';

const STATUS = ['OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY', 'RESOLVED', 'CLOSED'].map(s => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }));
function Inner() {
  const { me } = useAuth(); const router = useRouter(); const sp = useSearchParams(); const f = useListState(sp.get('active') ? { active: 'true' } : {}); const [create, setCreate] = useState(false);
  const list = useList<any>('incidents', '/incidents', f.state); const lgas = useLgas(); const cats = useCategories('INCIDENT');
  const add = useAct((v: any) => api.post('/incidents', v), { ok: r => `Incident ${r.ref} created`, invalidate: ['incidents', 'dashboard', 'map'], onDone: r => { setCreate(false); router.push(`/incidents/${r.id}`); } });
  const cols: Col<any>[] = [
    { key: 'ref', header: 'Incident', sort: 'ref', render: r => <><span className="font-semibold text-navy">{r.ref}</span>{r.isDemo && <DemoTag />}<span className="block max-w-xs truncate text-sm">{r.title}</span></> },
    { key: 'sev', header: 'Severity', sort: 'severity', render: r => <SeverityBadge severity={r.severity} /> }, { key: 'st', header: 'Status', sort: 'status', render: r => <StatusBadge status={r.status} /> },
    { key: 'cat', header: 'Category', render: r => r.category }, { key: 'lga', header: 'LGA', render: r => r.lga },
    { key: 'aff', header: 'Affected (est. / verified)', render: r => `${fmtNum(r.estAffected)} / ${fmtNum(r.verifiedAffected)}` }, { key: 'rep', header: 'Reports', render: r => r.reportCount }, { key: 'dep', header: 'Deployments', render: r => r.deploymentCount },
    { key: 'at', header: 'Created', sort: 'createdAt', render: r => ago(r.createdAt) }];
  return <div><PageHeader title="Incidents" sub="Verified emergencies under operational management." actions={can(me, 'incidents.create') && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />New incident</Button>} />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Incident ID or title" />
      <FilterSelect label="Status" value={f.state.status} onChange={v => f.setFilter('status', v)} options={STATUS} /><FilterSelect label="Severity" value={f.state.severity} onChange={v => f.setFilter('severity', v)} options={SEVERITIES} />
      <FilterSelect label="Category" value={f.state.category} onChange={v => f.setFilter('category', v)} options={(cats.data?.data ?? []).map(c => ({ value: c.key, label: c.label }))} /><FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={opts(lgas.data?.data)} />
      <FilterSelect label="Scope" value={f.state.active} onChange={v => f.setFilter('active', v)} options={[{ value: 'true', label: 'Active only' }]} /><FilterDate label="From" value={f.state.from} onChange={v => f.setFilter('from', v)} /><FilterDate label="To" value={f.state.to} onChange={v => f.setFilter('to', v)} /></FilterBar>
      <DataTable caption="Incidents" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} sort={f.state.sort} dir={f.state.dir} onSort={k => { f.setFilter('sort', k); f.setFilter('dir', f.state.sort === k && f.state.dir === 'desc' ? 'asc' : 'desc'); }} onRow={r => router.push(`/incidents/${r.id}`)} />
      <Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <FormDialog wide open={create} onClose={() => setCreate(false)} title="Create incident manually" submitLabel="Create incident" loading={add.isPending} onSubmit={v => add.mutateAsync(v)}
      fields={[{ name: 'title', label: 'Title', required: true, minLength: 5 }, { name: 'categoryId', label: 'Category', type: 'select', required: true, options: opts(cats.data?.data) }, { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES, initial: 'MODERATE' }, { name: 'lgaId', label: 'LGA', type: 'select', required: true, options: opts(lgas.data?.data) },
        { name: 'lat', label: 'Latitude', type: 'number', required: true, min: -90, max: 90 }, { name: 'lng', label: 'Longitude', type: 'number', required: true, min: -180, max: 180 }, { name: 'community', label: 'Community' }, { name: 'estAffected', label: 'Estimated affected', type: 'number', min: 0 }, { name: 'description', label: 'Description', type: 'textarea', required: true, minLength: 10 }]} /></div>;
}
export default function Incidents() { return <Suspense><Inner /></Suspense>; }
