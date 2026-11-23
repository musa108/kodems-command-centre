'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ago } from '@/lib/format';
import { Card, Col, DataTable, DemoTag, FilterBar, FilterSearch, FilterSelect, PageHeader, Pagination, SeverityBadge, StatusBadge } from '@/components/ui';
import { useList, useListState } from '@/lib/hooks';

function Inner() {
  const router = useRouter(); const sp = useSearchParams(); const f = useListState(sp.get('active') ? { active: 'true' } : {}); const list = useList<any>('deployments', '/deployments', f.state);
  const cols: Col<any>[] = [{ key: 'r', header: 'Deployment', render: r => <><span className="font-semibold text-navy">{r.ref}</span>{r.isDemo && <DemoTag />}</> }, { key: 't', header: 'Team', render: r => r.team.name }, { key: 'i', header: 'Incident', render: r => <>{r.incident.ref}<span className="block max-w-xs truncate text-xs text-muted">{r.incident.title}</span></> },
    { key: 'p', header: 'Priority', render: r => <SeverityBadge severity={r.priority} /> }, { key: 's', header: 'Status', render: r => <StatusBadge status={r.status} /> }, { key: 'd', header: 'Destination', render: r => r.destination }, { key: 'a', header: 'Assigned', render: r => ago(r.assignedAt) }];
  return <div><PageHeader title="Deployments" sub="Field response coordination. Field officers will update these same records from the Responder app." />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Reference, team, destination" />
      <FilterSelect label="Status" value={f.state.status} onChange={v => f.setFilter('status', v)} options={['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED', 'REASSIGNED'].map(s => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }))} />
      <FilterSelect label="Scope" value={f.state.active} onChange={v => f.setFilter('active', v)} options={[{ value: 'true', label: 'Active only' }]} /></FilterBar>
      <DataTable caption="Deployments" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} onRow={r => router.push(`/deployments/${r.id}`)} /><Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card></div>;
}
export default function Deployments() { return <Suspense><Inner /></Suspense>; }
