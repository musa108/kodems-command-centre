'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Button, Card, Col, ConfirmDialog, DataTable, DemoTag, FilterBar, FilterSearch, FilterSelect, FormDialog, PageHeader, Pagination} from '@/components/ui';
import { useAct, useList, useListState } from '@/lib/hooks';

const DAMAGE = ['NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED'].map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }));
const DISP = ['NOT_DISPLACED', 'DISPLACED', 'RETURNED', 'RESETTLED'].map(s => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }));
function Inner() {
  const { me } = useAuth(); const router = useRouter(); const sp = useSearchParams(); const f = useListState(sp.get('incidentId') ? { incidentId: sp.get('incidentId') } : {}); const [create, setCreate] = useState(false); const [dupe, setDupe] = useState<any>(null);
  const list = useList<any>('households', '/households', f.state); const incs = useList<any>('incidents', '/incidents', { active: true, pageSize: 100 }, create);
  const add = useAct((v: any) => api.post('/households', { ...v, needs: [] }), { ok: 'Household registered', invalidate: ['households', 'dashboard'], onDone: () => { setCreate(false); setDupe(null); } });
  const submit = async (v: any) => { try { await add.mutateAsync(v); } catch (e) { if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE') setDupe(v); } };
  const cols: Col<any>[] = [{ key: 'r', header: 'Household', render: r => <><span className="font-semibold text-navy">{r.ref}</span>{r.isDemo && <DemoTag />}</> }, { key: 'h', header: 'Head of household', render: r => r.headName }, { key: 's', header: 'Size', render: r => r.size }, { key: 'd', header: 'Damage', render: r => r.damage },
    { key: 'x', header: 'Displacement', render: r => r.displacement.replace('_', ' ').toLowerCase() }, { key: 'l', header: 'LGA', render: r => r.lga }, { key: 'i', header: 'Incident', render: r => r.incident }];
  return <div><PageHeader title="Affected persons & households" sub="Sensitive data. Names are masked unless you hold the PII permission; views of protected records are audited. No health information is collected." actions={can(me, 'population.manage') && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />Register household</Button>} />
    <Card><FilterBar active={f.active} onClear={f.reset}><FilterSearch value={f.state.q} onChange={v => f.setFilter('q', v)} placeholder="Household reference" /><FilterSelect label="Damage" value={f.state.damage} onChange={v => f.setFilter('damage', v)} options={DAMAGE} /><FilterSelect label="Displacement" value={f.state.displacement} onChange={v => f.setFilter('displacement', v)} options={DISP} /></FilterBar>
      <DataTable caption="Affected households" cols={cols} rows={list.data?.data} loading={list.isLoading} error={list.error} retry={() => list.refetch()} onRow={r => router.push(`/households/${r.id}`)} /><Pagination meta={list.data?.meta} onPage={p => f.setFilter('page', p)} /></Card>
    <FormDialog wide open={create} onClose={() => setCreate(false)} title="Register affected household" onSubmit={submit} loading={add.isPending} fields={[{ name: 'incidentId', label: 'Incident', type: 'select', required: true, options: (incs.data?.data ?? []).map((i: any) => ({ value: i.id, label: `${i.ref} — ${i.title}` })) }, { name: 'headName', label: 'Head of household', required: true, minLength: 2 }, { name: 'size', label: 'Household size', type: 'number', required: true, min: 1, max: 100 }, { name: 'damage', label: 'Damage', type: 'select', required: true, options: DAMAGE, initial: 'NONE' }, { name: 'displacement', label: 'Displacement', type: 'select', required: true, options: DISP, initial: 'NOT_DISPLACED' }, { name: 'community', label: 'Community' }, { name: 'immediateNeeds', label: 'Immediate needs', type: 'textarea' }]} />
    <ConfirmDialog open={!!dupe} onClose={() => setDupe(null)} title="Possible duplicate household" message="A household with the same head name already exists for this incident and LGA. Register anyway only if this is a different household." confirmLabel="Register anyway" onConfirm={() => add.mutate({ ...dupe, confirmNotDuplicate: true })} loading={add.isPending} /></div>;
}
export default function Households() { return <Suspense><Inner /></Suspense>; }
