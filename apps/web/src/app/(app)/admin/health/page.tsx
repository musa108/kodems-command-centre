'use client';
import { fmtDate } from '@/lib/format';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, StatusBadge, Button } from '@/components/ui';
import { useGet } from '@/lib/hooks';

export default function Health() {
  const q = useGet<any>('health', '/system/health', undefined, { refetchInterval: 30000 }); const h = q.data;
  if (q.error) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>; if (!h) return <Skeleton className="h-96" />;
  const row = (name: string, s: any, extra?: string) => <tr key={name}><td className="td font-semibold">{name}</td><td className="td"><StatusBadge status={s.status} /></td><td className="td text-sm text-muted">{s.latencyMs != null && `${s.latencyMs} ms · `}{s.error ?? extra ?? ''}</td></tr>;
  return <div><PageHeader title="System health" sub={`Real checks, run ${fmtDate(h.checkedAt)}. Anything not integrated is shown as pending or unknown — never green.`} actions={<Button variant="secondary" onClick={() => q.refetch()}>Re-check</Button>} />
    <Card><table className="w-full"><thead><tr><th className="th">Component</th><th className="th">Status</th><th className="th">Detail</th></tr></thead><tbody>
      {row('API', h.api)}{row('Database (PostgreSQL + PostGIS)', h.database, h.database.detail?.postgis)}{row('Queue / cache (Redis)', h.queue)}{row('Object storage', h.storage, h.storage.detail ? `${h.storage.detail.backend}` : undefined)}{row('Realtime outbox', h.outbox, h.outbox.detail ? `${h.outbox.detail.unpublished} unpublished events` : undefined)}
      {h.notificationProviders.map((p: any) => row(`Provider: ${p.key.toUpperCase()}`, p, p.status === 'INTEGRATION_PENDING' ? 'Credentials not configured — nothing is sent' : ''))}{row('Last backup', h.lastBackup, h.lastBackup.note)}</tbody></table></Card>
    <Card className="mt-5"><CardHeader title="Recent errors" /><p className="p-4 text-sm">Failed sign-ins (24 h): <b>{h.recentErrors.failedLoginsLast24h}</b>. {h.recentErrors.note}</p></Card></div>;
}
