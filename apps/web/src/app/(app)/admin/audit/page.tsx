'use client';
import { useState } from 'react';
import { fmtDate } from '@/lib/format';
import { Card, Col, DataTable, Dialog, FilterBar, FilterDate, FilterSearch, FilterSelect, PageHeader, Pagination } from '@/components/ui';
import { useList, useListState } from '@/lib/hooks';

export default function Audit() {
  const f = useListState({}); const list = useList<any>('audit', '/audit-logs', f.state); const [sel, setSel] = useState<any>(null);
  const cols: Col<any>[] = [{ key: 'at', header: 'When', render: r => fmtDate(r.at) }, { key: 'u', header: 'User', render: r => r.userName ?? <span className="text-muted">system / anonymous</span> }, { key: 'a', header: 'Action', render: r => <code className="text-xs font-semibold">{r.action}</code> }, { key: 'e', header: 'Entity', render: r => <>{r.entityType}<span className="block max-w-[160px] truncate text-xs text-muted">{r.entityId}</span></> }, { key: 'r', header: 'Reason', render: r => r.reason ?? '—' }, { key: 'ip', header: 'IP', render: r => r.ip ?? '—' }];
  return <div><PageHeader title="Audit log" sub="Immutable: the database rejects updates and deletes on this table." /><Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Action or entity ID" />
    <FilterSelect label="Entity" value={f.state.entityType} onChange={v => f.setFilter('entityType', v)} options={['incident', 'report', 'deployment', 'team', 'user', 'role', 'allocation', 'distribution', 'inventory', 'household', 'person', 'shelter', 'alert', 'export', 'setting'].map(s => ({ value: s, label: s }))} /><FilterDate label="From" value={f.state.from} onChange={v => f.setFilter('from', v)} /><FilterDate label="To" value={f.state.to} onChange={v => f.setFilter('to', v)} /></FilterBar>
    <DataTable caption="Audit log" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} onRow={setSel} /><Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <Dialog wide open={!!sel} onClose={() => setSel(null)} title="Audit entry">{sel && <dl className="space-y-2 text-sm"><p><b>{sel.action}</b> by {sel.userName ?? 'system'} at {fmtDate(sel.at)}</p><p className="text-xs text-muted">{sel.userAgent}</p>{sel.reason && <p>Reason: {sel.reason}</p>}<div className="grid gap-3 sm:grid-cols-2"><div><p className="label">Before</p><pre className="max-h-64 overflow-auto rounded bg-navy-50 p-2 text-xs">{JSON.stringify(sel.before, null, 2) ?? '—'}</pre></div><div><p className="label">After</p><pre className="max-h-64 overflow-auto rounded bg-navy-50 p-2 text-xs">{JSON.stringify(sel.after, null, 2) ?? '—'}</pre></div></div></dl>}</Dialog></div>;
}
