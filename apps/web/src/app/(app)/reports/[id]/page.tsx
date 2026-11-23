'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Flag, Ban, UserPlus, StickyNote } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fmtDate, humanize } from '@/lib/format';
import { Button, Card, CardHeader, DemoTag, Dialog, ErrorState, FormDialog, KV, PageHeader, SeverityBadge, Skeleton, StatusBadge } from '@/components/ui';
import { MediaViewer } from '@/components/media-viewer';
import { FormBody as FormDialogBody } from '@/components/ui/form-body';
import { opts, SEVERITIES, useAct, useCategories, useGet, useStaff } from '@/lib/hooks';

const CommandMap = dynamic(() => import('@/components/maps/command-map').then(m => m.CommandMap), { ssr: false, loading: () => <Skeleton className="h-64" /> });
type Dlg = null | 'verify' | 'reject' | 'dup' | 'assign' | 'note' | 'escalate';

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const [dlg, setDlg] = useState<Dlg>(null); const [mode, setMode] = useState<'create' | 'link' | 'none'>('create');
  const q = useGet<any>('reports', `/reports/${id}`); const r = q.data; const cats = useCategories('INCIDENT'); const staff = useStaff('incidents.verify', dlg === 'assign');
  const openInc = useQuery({ queryKey: ['incidents', 'open-list'], queryFn: () => api.get<any>('/incidents', { active: true, pageSize: 100 }), enabled: dlg === 'verify' && mode === 'link' });
  const originals = useQuery({ queryKey: ['reports', 'originals'], queryFn: () => api.get<any>('/reports', { pageSize: 100, status: 'SUBMITTED,UNDER_REVIEW,VERIFIED' }), enabled: dlg === 'dup' });
  const done = () => setDlg(null); const inv = ['reports', 'incidents', 'dashboard'];
  const verify = useAct((v: any) => api.post(`/reports/${id}/verify`, { version: r.version, note: v.note, incident: mode === 'none' ? { mode } : mode === 'link' ? { mode, incidentId: v.incidentId } : { mode, data: { title: v.title, description: v.description, categoryId: v.categoryId, severity: v.severity, estAffected: v.estAffected } } }), { ok: x => x.incident ? `Verified — incident ${x.incident.ref} ${mode === 'create' ? 'created' : 'linked'}` : 'Report verified', invalidate: inv, onDone: done });
  const reject = useAct((v: any) => api.post(`/reports/${id}/reject`, { reason: v.reason, version: r.version }), { ok: 'Report rejected', invalidate: inv, onDone: done });
  const dup = useAct((v: any) => api.post(`/reports/${id}/mark-duplicate`, { originalId: v.originalId, version: r.version }), { ok: 'Marked as duplicate', invalidate: inv, onDone: done });
  const assign = useAct((v: any) => api.post(`/reports/${id}/assign`, { officerId: v.officerId }), { ok: 'Officer assigned', invalidate: inv, onDone: done });
  const note = useAct((v: any) => api.post(`/reports/${id}/notes`, { body: v.body }), { ok: 'Note added', invalidate: inv, onDone: done });
  const esc = useAct((v: any) => api.post(`/reports/${id}/escalate`, { reason: v.reason }), { ok: 'Escalated to CRITICAL — operations notified', invalidate: inv, onDone: done });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (q.error || !r) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>;
  const pending = ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status); const canVerify = can(me, 'incidents.verify') && pending;
  const verifyFields = mode === 'create' ? [{ name: 'title', label: 'Incident title', required: true, minLength: 5, initial: `${r.category.label} — ${r.community ?? r.lga.name}` }, { name: 'categoryId', label: 'Category', type: 'select' as const, required: true, options: opts(cats.data?.data), initial: r.categoryId }, { name: 'severity', label: 'Severity', type: 'select' as const, required: true, options: SEVERITIES, initial: r.suggestedSeverity },
    { name: 'estAffected', label: 'Estimated affected', type: 'number' as const, min: 0, initial: r.estAffected ?? '' }, { name: 'description', label: 'Description', type: 'textarea' as const, required: true, minLength: 10, initial: r.description }, { name: 'note', label: 'Verification note', type: 'textarea' as const }]
    : mode === 'link' ? [{ name: 'incidentId', label: 'Existing incident', type: 'select' as const, required: true, options: (openInc.data?.data ?? []).map((i: any) => ({ value: i.id, label: `${i.ref} — ${i.title}` })) }, { name: 'note', label: 'Verification note', type: 'textarea' as const }] : [{ name: 'note', label: 'Verification note', type: 'textarea' as const }];
  return <div>
    <PageHeader title={r.ref} sub={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><SeverityBadge severity={r.suggestedSeverity} />{r.isDemo && <DemoTag />}<span>{r.category.label} · {r.lga.name}</span></span>}
      actions={<>{can(me, 'reports.assign') && pending && <Button variant="secondary" onClick={() => setDlg('assign')}><UserPlus className="h-4 w-4" />Assign</Button>}{can(me, 'reports.note') && <Button variant="secondary" onClick={() => setDlg('note')}><StickyNote className="h-4 w-4" />Note</Button>}
        {canVerify && <><Button variant="secondary" onClick={() => setDlg('escalate')}><Flag className="h-4 w-4" />Escalate</Button><Button variant="secondary" onClick={() => setDlg('dup')}><Copy className="h-4 w-4" />Duplicate</Button>{can(me, 'incidents.reject') && <Button variant="danger" onClick={() => setDlg('reject')}><Ban className="h-4 w-4" />Reject</Button>}<Button onClick={() => { setMode('create'); setDlg('verify'); }}><CheckCircle2 className="h-4 w-4" />Verify</Button></>}</>} />
    {r.incident && <p className="mb-4 rounded-md border border-ok/30 bg-ok-bg px-3 py-2 text-sm text-ok">Linked to incident <Link className="font-semibold underline" href={`/incidents/${r.incident.id}`}>{r.incident.ref} — {r.incident.title}</Link></p>}
    {r.status === 'REJECTED' && <p className="mb-4 rounded-md border border-crit/30 bg-crit-bg px-3 py-2 text-sm text-crit">Rejected: {r.rejectionReason}</p>}
    {r.possibleDuplicates?.length > 0 && pending && <div role="note" className="mb-4 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn"><b>Possible duplicates</b> (same category within 2 km / 48 h): {r.possibleDuplicates.map((d: any) => <Link key={d.id} href={`/reports/${d.id}`} className="ml-2 font-semibold underline">{d.ref}</Link>)}</div>}
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><div className="space-y-5">
      <Card><CardHeader title="Report" /><div className="space-y-4 p-4"><p className="whitespace-pre-wrap text-sm">{r.description}</p><dl className="grid gap-4 sm:grid-cols-3"><KV k="Incident time">{fmtDate(r.incidentAt)}</KV><KV k="Submitted">{fmtDate(r.submittedAt)}</KV><KV k="Est. affected">{r.estAffected}</KV><KV k="Community">{r.community}</KV><KV k="Address / landmark">{r.address}</KV><KV k="Coordinates">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</KV><KV k="Immediate needs">{r.immediateNeeds}</KV><KV k="Assigned officer">{r.assignedOfficerName}</KV>
        {can(me, 'incidents.verify') && <><KV k="Reporter">{r.reporterName}</KV><KV k="Reporter contact">{r.reporterPhone}</KV></>}</dl></div></Card>
      <Card><CardHeader title="Location" /><div className="p-3"><CommandMap height={260} incidents={[{ id: r.id, ref: r.ref, title: r.description.slice(0, 50), category: r.category.key, categoryLabel: r.category.label, severity: r.suggestedSeverity, status: 'OPEN', lat: r.lat, lng: r.lng, lga: r.lga.name, createdAt: r.submittedAt }]} layers={{ incidents: true, teams: false, shelters: false, warehouses: false, boundaries: false }} focus={{ lat: r.lat, lng: r.lng }} /></div></Card>
      <Card><CardHeader title="Media" /><div className="p-4"><MediaViewer media={r.media} /></div></Card></div>
    <div className="space-y-5"><Card><CardHeader title="Status history" />{r.history.length ? <ol className="divide-y divide-line">{r.history.map((h: any) => <li key={h.id} className="px-4 py-2.5 text-sm"><p><StatusBadge status={h.to} /> <span className="text-xs text-muted">from {humanize(h.from)}</span></p><p className="text-xs text-muted">{fmtDate(h.at)} · {h.actorName ?? 'System'}</p>{h.reason && <p className="mt-0.5">{h.reason}</p>}</li>)}</ol> : null}</Card>
      <Card><CardHeader title="Internal notes" />{r.notes.length ? <ul className="divide-y divide-line">{r.notes.map((n: any) => <li key={n.id} className="px-4 py-2.5 text-sm"><p>{n.body}</p><p className="text-xs text-muted">{n.authorName} · {fmtDate(n.createdAt)}</p></li>)}</ul> : <p className="p-4 text-sm text-muted">No notes yet.</p>}</Card></div></div>
    <Dialog wide open={dlg === 'verify'} onClose={done} title="Verify report"><p className="mb-3 text-sm text-muted">Verification is an explicit decision. Choose what happens next:</p>
      <div className="mb-4 flex gap-2" role="radiogroup" aria-label="After verification">{([['create', 'Create new incident'], ['link', 'Link to existing incident'], ['none', 'Verify only']] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${mode === k ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy'}`}>{l}</button>)}</div>
      <VerifyForm key={mode} fields={verifyFields} onSubmit={v => verify.mutateAsync(v)} loading={verify.isPending} onCancel={done} /></Dialog>
    <FormDialog open={dlg === 'reject'} onClose={done} title="Reject report" submitLabel="Reject report" onSubmit={v => reject.mutateAsync(v)} loading={reject.isPending} fields={[{ name: 'reason', label: 'Reason (mandatory)', type: 'textarea', required: true, minLength: 5 }]} />
    <FormDialog open={dlg === 'dup'} onClose={done} title="Mark as duplicate" submitLabel="Mark duplicate" onSubmit={v => dup.mutateAsync(v)} loading={dup.isPending} fields={[{ name: 'originalId', label: 'Original (canonical) report', type: 'select', required: true, options: (originals.data?.data ?? []).filter((x: any) => x.id !== id).map((x: any) => ({ value: x.id, label: `${x.ref} — ${x.category} · ${x.lga}` })) }]} />
    <FormDialog open={dlg === 'assign'} onClose={done} title="Assign verification officer" submitLabel="Assign" onSubmit={v => assign.mutateAsync(v)} loading={assign.isPending} fields={[{ name: 'officerId', label: 'Officer', type: 'select', required: true, options: opts(staff.data?.data) }]} />
    <FormDialog open={dlg === 'note'} onClose={done} title="Add internal note" onSubmit={v => note.mutateAsync(v)} loading={note.isPending} fields={[{ name: 'body', label: 'Note', type: 'textarea', required: true, minLength: 2 }]} />
    <FormDialog open={dlg === 'escalate'} onClose={done} title="Escalate to CRITICAL" submitLabel="Escalate" onSubmit={v => esc.mutateAsync(v)} loading={esc.isPending} fields={[{ name: 'reason', label: 'Why is this critical?', type: 'textarea', required: true, minLength: 5 }]} /></div>;
}
function VerifyForm({ fields, onSubmit, loading, onCancel }: { fields: any[]; onSubmit: (v: any) => Promise<any>; loading: boolean; onCancel: () => void }) {
  return <FormDialogBody fields={fields} onSubmit={onSubmit} loading={loading} onCancel={onCancel} />;
}
