'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ago, fmtDate } from '@/lib/format';
import { Button, Card, Col, DataTable, DemoTag, FilterBar, FilterDate, FilterSearch, FilterSelect, FormDialog, PageHeader, Pagination, SeverityBadge, StatusBadge } from '@/components/ui';
import { opts, SEVERITIES, useAct, useCategories, useLgas, useList, useListState } from '@/lib/hooks';

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'DUPLICATE', 'REJECTED'].map(s => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }));
function Inner() {
  const { me } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const f = useListState(sp.get('queue') ? { status: 'SUBMITTED,UNDER_REVIEW' } : {}); const [create, setCreate] = useState(false);
  const list = useList<any>('reports', '/reports', f.state); const lgas = useLgas(); const cats = useCategories('INCIDENT');
  const add = useAct((v: any) => api.post('/reports', { ...v, incidentAt: new Date(v.incidentAt).toISOString() }), { ok: r => `Report ${r.ref} submitted`, invalidate: ['reports', 'dashboard'], onDone: r => { setCreate(false); router.push(`/reports/${r.id}`); } });
  const cols: Col<any>[] = [
    { key: 'ref', header: 'Reference', sort: 'ref', render: r => <span className="font-semibold text-navy">{r.ref}{r.isDemo && <DemoTag />}</span> },
    { key: 'sev', header: 'Severity', sort: 'suggestedSeverity', render: r => <SeverityBadge severity={r.severity} /> },
    { key: 'status', header: 'Status', sort: 'status', render: r => <StatusBadge status={r.status} /> },
    { key: 'cat', header: 'Category', render: r => r.category },
    { key: 'desc', header: 'Description', className: 'max-w-xs', render: r => <span className="line-clamp-2">{r.description}</span> },
    { key: 'lga', header: 'LGA', render: r => <>{r.lga}{r.community && <span className="block text-xs text-muted">{r.community}</span>}</> },
    { key: 'at', header: 'Submitted', sort: 'submittedAt', render: r => <span title={fmtDate(r.submittedAt)}>{ago(r.submittedAt)}</span> },
    { key: 'inc', header: 'Incident', render: r => r.incidentId ? <span className="text-xs font-semibold text-ok">Linked</span> : <span className="text-xs text-muted">—</span> },
  ];
  return <div><PageHeader title="Emergency reports" sub="A report is not an incident until an authorised officer verifies it." actions={<>{can(me, 'reports.create') && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />Log report</Button>}<Button variant="secondary" onClick={() => { f.reset(); f.setFilter('status', 'SUBMITTED,UNDER_REVIEW'); }}>Verification queue</Button></>} />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Reference, description, address" />
      <FilterSelect label="Status" value={f.state.status} onChange={v => f.setFilter('status', v)} options={[...STATUSES, { value: 'SUBMITTED,UNDER_REVIEW', label: 'Pending (queue)' }]} />
      <FilterSelect label="Severity" value={f.state.severity} onChange={v => f.setFilter('severity', v)} options={SEVERITIES} />
      <FilterSelect label="Category" value={f.state.category} onChange={v => f.setFilter('category', v)} options={(cats.data?.data ?? []).map(c => ({ value: c.key, label: c.label }))} />
      <FilterSelect label="LGA" value={f.state.lgaId} onChange={v => f.setFilter('lgaId', v)} options={opts(lgas.data?.data)} />
      <FilterSelect label="Assigned" value={f.state.assigned} onChange={v => f.setFilter('assigned', v)} options={[{ value: 'me', label: 'To me' }, { value: 'none', label: 'Unassigned' }]} />
      <FilterDate label="From" value={f.state.from} onChange={v => f.setFilter('from', v)} /><FilterDate label="To" value={f.state.to} onChange={v => f.setFilter('to', v)} /></FilterBar>
      <DataTable caption="Emergency reports" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} sort={f.state.sort} dir={f.state.dir} onSort={k => { f.setFilter('sort', k); f.setFilter('dir', f.state.sort === k && f.state.dir === 'desc' ? 'asc' : 'desc'); }} onRow={r => router.push(`/reports/${r.id}`)} />
      <Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <FormDialog wide open={create} onClose={() => setCreate(false)} title="Log a report (web channel)" submitLabel="Submit report" loading={add.isPending} onSubmit={v => add.mutateAsync(v)} serverErrors={(add.error as any)?.fieldErrors}
      fields={[{ name: 'categoryId', label: 'Category', type: 'select', required: true, options: opts(cats.data?.data) }, { name: 'suggestedSeverity', label: 'Suggested severity', type: 'select', required: true, options: SEVERITIES, initial: 'MODERATE' },
        { name: 'lgaId', label: 'LGA', type: 'select', required: true, options: opts(lgas.data?.data) }, { name: 'incidentAt', label: 'When it happened', type: 'datetime', required: true, initial: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) },
        { name: 'lat', label: 'Latitude', type: 'number', required: true, min: -90, max: 90 }, { name: 'lng', label: 'Longitude', type: 'number', required: true, min: -180, max: 180 },
        { name: 'community', label: 'Community' }, { name: 'address', label: 'Address / landmark' }, { name: 'estAffected', label: 'Estimated people affected', type: 'number', min: 0 }, { name: 'immediateNeeds', label: 'Immediate needs' },
        { name: 'reporterName', label: 'Reporter name (optional)' }, { name: 'reporterPhone', label: 'Reporter phone (optional)' }, { name: 'description', label: 'Description', type: 'textarea', required: true, minLength: 10 }]} /></div>;
}
export default function Reports() { return <Suspense><Inner /></Suspense>; }
