'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fmtDate, humanize } from '@/lib/format';
import { Button, Card, CardHeader, DemoTag, ErrorState, FormDialog, KV, PageHeader, Skeleton } from '@/components/ui';
import { useAct, useGet } from '@/lib/hooks';

export default function HouseholdDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const q = useGet<any>('households', `/households/${id}`); const h = q.data; const [dlg, setDlg] = useState<null | 'person' | 'status'>(null); const done = () => setDlg(null);
  const person = useAct((v: any) => api.post('/persons', { householdId: id, ...v }), { ok: 'Person registered', invalidate: ['households'], onDone: done });
  const status = useAct((v: any) => api.patch(`/households/${id}`, { ...v, version: h.version }), { ok: 'Household updated', invalidate: ['households', 'dashboard'], onDone: done });
  if (q.isLoading) return <Skeleton className="h-96" />; if (q.error || !h) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>;
  return <div><PageHeader title={h.ref} sub={<span className="flex items-center gap-2">{h.isDemo && <DemoTag />}<span>Incident <Link className="font-semibold text-info" href={`/incidents/${h.incident.id}`}>{h.incident.ref}</Link></span></span>} actions={can(me, 'population.manage') && <><Button variant="secondary" onClick={() => setDlg('person')}>Add person</Button><Button variant="secondary" onClick={() => setDlg('status')}>Update status</Button></>} />
    <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader title="Household" /><dl className="grid gap-4 p-4 sm:grid-cols-2"><KV k="Head">{h.headName}</KV><KV k="Size">{h.size}</KV><KV k="Damage">{humanize(h.damage)}</KV><KV k="Displacement">{humanize(h.displacement)}</KV><KV k="LGA">{h.lga.name}</KV><KV k="Community">{h.community}</KV><KV k="Immediate needs">{h.immediateNeeds}</KV><KV k="Registered">{fmtDate(h.createdAt)}</KV><KV k="Relief beneficiary record">{h.beneficiary?.ref ?? 'Not linked (a beneficiary is a separate record)'}</KV></dl></Card>
      <Card><CardHeader title={`Registered persons (${h.persons.length}/${h.size})`} />{h.persons.length ? <ul className="divide-y divide-line">{h.persons.map((p: any) => <li key={p.id} className="px-4 py-2.5 text-sm"><b>{p.name ?? '—'}</b> <span className="text-muted">{p.ageBand} · {humanize(p.displacement)} · {p.ref}</span></li>)}</ul> : <p className="p-4 text-sm text-muted">No individuals registered.</p>}</Card></div>
    <FormDialog open={dlg === 'person'} onClose={done} title="Register person" onSubmit={v => person.mutateAsync(v)} loading={person.isPending} fields={[{ name: 'name', label: 'Name (optional)' }, { name: 'ageBand', label: 'Age band', type: 'select', options: ['0-4', '5-17', '18-59', '60+'].map(a => ({ value: a, label: a })) }, { name: 'relationship', label: 'Relationship to head' }, { name: 'displacement', label: 'Displacement', type: 'select', initial: h.displacement, options: ['NOT_DISPLACED', 'DISPLACED', 'RETURNED', 'RESETTLED'].map(a => ({ value: a, label: humanize(a) })) }]} />
    <FormDialog open={dlg === 'status'} onClose={done} title="Update household" onSubmit={v => status.mutateAsync(v)} loading={status.isPending} fields={[{ name: 'damage', label: 'Damage', type: 'select', initial: h.damage, options: ['NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED'].map(a => ({ value: a, label: humanize(a) })) }, { name: 'displacement', label: 'Displacement / return / resettlement', type: 'select', initial: h.displacement, options: ['NOT_DISPLACED', 'DISPLACED', 'RETURNED', 'RESETTLED'].map(a => ({ value: a, label: humanize(a) })) }, { name: 'size', label: 'Household size', type: 'number', min: 1, initial: h.size }]} /></div>;
}
