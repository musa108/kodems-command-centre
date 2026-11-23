'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fmtDate } from '@/lib/format';
import { Button, Card, CardHeader, DemoTag, ErrorState, FormDialog, KV, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useAct, useGet } from '@/lib/hooks';

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const q = useGet<any>('teams', `/teams/${id}`); const t = q.data; const [dlg, setDlg] = useState<null | 'member' | 'avail'>(null); const done = () => setDlg(null);
  const member = useAct((v: any) => api.post(`/teams/${id}/members`, v), { ok: 'Member added', invalidate: ['teams'], onDone: done });
  const avail = useAct((v: any) => api.patch(`/teams/${id}/availability`, { ...v, version: t.version }), { ok: 'Availability updated', invalidate: ['teams', 'map'], onDone: done });
  if (q.isLoading) return <Skeleton className="h-96" />; if (q.error || !t) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>;
  const manage = can(me, 'teams.manage');
  return <div><PageHeader title={t.name} sub={<span className="flex items-center gap-2"><StatusBadge status={t.status} />{t.isDemo && <DemoTag />}<span>{t.code} · {t.category.label}</span></span>} actions={manage && <><Button variant="secondary" onClick={() => setDlg('member')}>Add member</Button><Button variant="secondary" disabled={t.status === 'DEPLOYED'} title={t.status === 'DEPLOYED' ? 'Controlled by its active deployment' : undefined} onClick={() => setDlg('avail')}>Update availability</Button></>} />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]"><div className="space-y-5">
      <Card><CardHeader title="Overview" /><dl className="grid gap-4 p-4 sm:grid-cols-3"><KV k="Agency">{t.agency}</KV><KV k="Base LGA">{t.lga.name}</KV><KV k="Contact">{t.contact}</KV><KV k="Capabilities">{t.capabilities.map((c: any) => c.name).join(', ')}</KV><KV k="Last known position">{t.lastLat ? `${t.lastLat.toFixed(4)}, ${t.lastLng.toFixed(4)} (${fmtDate(t.lastLocationAt)})` : 'Not reported'}</KV><KV k="Updated">{fmtDate(t.updatedAt)}</KV></dl></Card>
      <Card><CardHeader title="Current deployment" />{t.currentDeployment ? <Link href={`/deployments/${t.currentDeployment.id}`} className="flex items-center justify-between p-4 hover:bg-navy-50"><div><p className="font-semibold text-navy">{t.currentDeployment.ref}</p><p className="text-sm text-muted">{t.currentDeployment.incident.ref} — {t.currentDeployment.incident.title}</p></div><StatusBadge status={t.currentDeployment.status} /></Link> : <p className="p-4 text-sm text-muted">Not currently deployed.</p>}</Card>
      <Card><CardHeader title="Deployment history" />{t.deployments.length ? <ul className="divide-y divide-line">{t.deployments.map((d: any) => <li key={d.id}><Link href={`/deployments/${d.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-navy-50"><span>{d.ref} · {d.incident.ref}</span><StatusBadge status={d.status} /></Link></li>)}</ul> : <p className="p-4 text-sm text-muted">No history.</p>}</Card></div>
    <div className="space-y-5"><Card><CardHeader title="Members" />{t.members.length ? <ul className="divide-y divide-line">{t.members.map((m: any) => <li key={m.id} className="px-4 py-2.5 text-sm"><b>{m.name}</b>{m.isLeader && <span className="ml-2 rounded bg-gold-100 px-1.5 text-[10px] font-bold uppercase text-gold-600">Leader</span>}<p className="text-xs text-muted">{m.role} {m.phone && `· ${m.phone}`}</p></li>)}</ul> : <p className="p-4 text-sm text-muted">No members registered.</p>}</Card>
      <Card><CardHeader title="Equipment & vehicles" /><div className="space-y-2 p-4 text-sm">{t.equipment.map((e: any) => <p key={e.id}>{e.quantity} × {e.name}</p>)}{t.vehicles.map((v: any) => <p key={v.id}>{v.type} · {v.plate}</p>)}{!t.equipment.length && !t.vehicles.length && <p className="text-muted">None recorded.</p>}</div></Card></div></div>
    <FormDialog open={dlg === 'member'} onClose={done} title="Register member" onSubmit={v => member.mutateAsync(v)} loading={member.isPending} fields={[{ name: 'name', label: 'Name', required: true, minLength: 2 }, { name: 'role', label: 'Role' }, { name: 'phone', label: 'Phone' }, { name: 'isLeader', label: 'Team leader (replaces current leader)', type: 'checkbox' }]} />
    <FormDialog open={dlg === 'avail'} onClose={done} title="Update availability" onSubmit={v => avail.mutateAsync(v)} loading={avail.isPending} fields={[{ name: 'status', label: 'Status', type: 'select', required: true, options: ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'].map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })), initial: t.status === 'DEPLOYED' ? '' : t.status }, { name: 'reason', label: 'Reason (required unless AVAILABLE)' }]} /></div>;
}
