'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fmtDate, humanize } from '@/lib/format';
import { Button, Card, CardHeader, ErrorState, FormDialog, KV, PageHeader, SeverityBadge, Skeleton, StatusBadge } from '@/components/ui';
import { opts, useAct, useGet, useList } from '@/lib/hooks';

const NEXT: Record<string, string | undefined> = { ASSIGNED: 'ACCEPTED', ACCEPTED: 'EN_ROUTE', EN_ROUTE: 'ON_SITE' };
type Dlg = null | 'update' | 'complete' | 'cancel' | 'reassign';
export default function DeploymentDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const [dlg, setDlg] = useState<Dlg>(null); const done = () => setDlg(null); const q = useGet<any>('deployments', `/deployments/${id}`); const d = q.data; const inv = ['deployments', 'teams', 'incidents', 'dashboard', 'map'];
  const teams = useList<any>('teams', '/teams', { status: 'AVAILABLE', pageSize: 100 }, dlg === 'reassign');
  const adv = useAct((s: string) => api.patch(`/deployments/${id}`, { status: s, version: d.version }), { ok: 'Status updated', invalidate: inv });
  const upd = useAct((v: any) => api.post(`/deployments/${id}/updates`, v), { ok: 'Update recorded', invalidate: inv, onDone: done });
  const comp = useAct((v: any) => api.post(`/deployments/${id}/complete`, { ...v, version: d.version }), { ok: 'Deployment completed — team released', invalidate: inv, onDone: done });
  const canc = useAct((v: any) => api.patch(`/deployments/${id}`, { status: 'CANCELLED', reason: v.reason, version: d.version }), { ok: 'Deployment cancelled', invalidate: inv, onDone: done });
  const re = useAct((v: any) => api.post(`/deployments/${id}/reassign`, v), { ok: 'Reassigned', invalidate: inv, onDone: done });
  if (q.isLoading) return <Skeleton className="h-96" />; if (q.error || !d) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>;
  const active = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'].includes(d.status); const upCan = can(me, 'deployments.update'); const n = NEXT[d.status];
  return <div><PageHeader title={d.ref} sub={<span className="flex items-center gap-2"><StatusBadge status={d.status} /><SeverityBadge severity={d.priority} /><span>{d.team.name} → <Link className="font-semibold text-info" href={`/incidents/${d.incident.id}`}>{d.incident.ref}</Link></span></span>}
    actions={active && upCan && <>{n && <Button onClick={() => adv.mutate(n)} loading={adv.isPending}>Mark {humanize(n)}</Button>}<Button variant="secondary" onClick={() => setDlg('update')}>Field update</Button>{d.status === 'ON_SITE' && <Button variant="gold" onClick={() => setDlg('complete')}>Complete</Button>}{can(me, 'deployments.assign') && <Button variant="secondary" onClick={() => setDlg('reassign')}>Reassign</Button>}<Button variant="danger" onClick={() => setDlg('cancel')}>Cancel</Button></>} />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]"><div className="space-y-5"><Card><CardHeader title="Assignment" /><dl className="grid gap-4 p-4 sm:grid-cols-3"><KV k="Destination">{d.destination}</KV><KV k="Assigned by">{d.assignedByName}</KV><KV k="Assigned">{fmtDate(d.assignedAt)}</KV><KV k="Accepted">{fmtDate(d.acceptedAt)}</KV><KV k="Departed">{fmtDate(d.departedAt)}</KV><KV k="Arrived">{fmtDate(d.arrivedAt)}</KV><KV k="Completed">{fmtDate(d.completedAt)}</KV><KV k="Required resources">{d.requiredResources}</KV><KV k="Instructions">{d.instructions}</KV></dl>
      {d.completionReport && <div className="border-t border-line p-4 text-sm"><b>Completion report</b><p className="mt-1 whitespace-pre-wrap">{d.completionReport}</p></div>}{d.cancelReason && <div className="border-t border-line p-4 text-sm"><b>Cancel / reassign reason</b><p className="mt-1">{d.cancelReason}</p></div>}</Card>
      <Card><CardHeader title="Field updates" />{d.updates.length ? <ul className="divide-y divide-line">{d.updates.map((u: any) => <li key={u.id} className="px-4 py-2.5 text-sm"><p><span className="mr-2 text-xs font-bold uppercase text-gold-600">{humanize(u.kind)}</span>{u.message}</p><p className="text-xs text-muted">{u.authorName} · {fmtDate(u.at)}{u.lat != null && ` · ${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}`}</p></li>)}</ul> : <p className="p-4 text-sm text-muted">No field updates yet.</p>}</Card></div>
      <Card><CardHeader title="Status history" /><ol className="divide-y divide-line">{d.history.map((h: any) => <li key={h.id} className="px-4 py-2.5 text-sm"><StatusBadge status={h.to} /><p className="text-xs text-muted">{fmtDate(h.at)} · {h.actorName ?? 'System'}</p>{h.reason && <p>{h.reason}</p>}</li>)}</ol></Card></div>
    <FormDialog open={dlg === 'update'} onClose={done} title="Record field update" onSubmit={v => upd.mutateAsync(v)} loading={upd.isPending} fields={[{ name: 'kind', label: 'Type', type: 'select', required: true, initial: 'FIELD_UPDATE', options: ['FIELD_UPDATE', 'CHALLENGE', 'RESOURCE_REQUEST', 'INSTRUCTION', 'ESCALATION'].map(k => ({ value: k, label: humanize(k) })) }, { name: 'message', label: 'Message', type: 'textarea', required: true, minLength: 3 }, { name: 'lat', label: 'Latitude (optional)', type: 'number' }, { name: 'lng', label: 'Longitude (optional)', type: 'number' }]} />
    <FormDialog open={dlg === 'complete'} onClose={done} title="Completion report" submitLabel="Complete deployment" onSubmit={v => comp.mutateAsync(v)} loading={comp.isPending} fields={[{ name: 'completionReport', label: 'Completion report (required)', type: 'textarea', required: true, minLength: 10 }]} />
    <FormDialog open={dlg === 'cancel'} onClose={done} title="Cancel deployment" submitLabel="Cancel deployment" onSubmit={v => canc.mutateAsync(v)} loading={canc.isPending} fields={[{ name: 'reason', label: 'Reason (required)', type: 'textarea', required: true, minLength: 3 }]} />
    <FormDialog open={dlg === 'reassign'} onClose={done} title="Reassign to another team" submitLabel="Reassign" onSubmit={v => re.mutateAsync(v)} loading={re.isPending} fields={[{ name: 'teamId', label: 'Available team', type: 'select', required: true, options: opts(teams.data?.data) }, { name: 'reason', label: 'Reason (required)', type: 'textarea', required: true, minLength: 5 }]} /></div>;
}
