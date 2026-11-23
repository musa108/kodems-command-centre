'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui';
import { useAct, useList } from '@/lib/hooks';

const href = (n: any) => ({ incident: `/incidents/${n.entityId}`, report: `/reports/${n.entityId}`, deployment: `/deployments/${n.entityId}`, shelter: `/shelters/${n.entityId}`, allocation: '/relief', alert: '/alerts', warehouse: '/relief' } as Record<string, string>)[n.entityType] ?? '/notifications';
export default function Notifications() {
  const router = useRouter(); const [page, setPage] = useState(1); const [unread, setUnread] = useState(false); const q = useList<any>('notifications', '/notifications', { page, pageSize: 20, unread: unread || undefined });
  const all = useAct(() => api.post('/notifications/read-all'), { ok: 'All marked as read', invalidate: ['notifications'] });
  return <div><PageHeader title="Notifications" sub="In-app notifications. External channels (SMS, email, push) depend on provider configuration." actions={<><Button variant="secondary" onClick={() => setUnread(u => !u)}>{unread ? 'Show all' : 'Unread only'}</Button><Button variant="secondary" onClick={() => all.mutate(undefined)}>Mark all read</Button></>} />
    <Card>{q.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data?.data.length ? <ul className="divide-y divide-line">{q.data.data.map((n: any) => <li key={n.id}><button className={`block w-full px-4 py-3 text-left hover:bg-navy-50 ${n.readAt ? '' : 'bg-gold-50'}`} onClick={async () => { if (!n.readAt) await api.patch(`/notifications/${n.id}/read`); router.push(href(n)); }}><p className="text-sm font-semibold">{!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-gold" aria-label="Unread" />}{n.title}</p><p className="text-sm text-muted">{n.body}</p><p className="text-xs text-muted">{ago(n.createdAt)}</p></button></li>)}</ul> : <EmptyState title="No notifications" />}<Pagination meta={q.data?.meta} onPage={setPage} /></Card></div>;
}
