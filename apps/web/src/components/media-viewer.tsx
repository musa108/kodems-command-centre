'use client';
import { useEffect, useState } from 'react';
import { API_URL, getAccessToken } from '@/lib/api';
import { Dialog } from '@/components/ui';

/** Media is fetched with the bearer token (permission + scope checked server-side) and shown from a blob URL. */
function useBlob(key: string | null) {
  const [url, setUrl] = useState<string | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { if (!key) return; let u: string | null = null; let live = true; fetch(`${API_URL}/media/${key}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } }).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => { if (live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => live && setErr(true)); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [key]);
  return { url, err };
}
function Thumb({ m, onOpen }: { m: { id: string; storageKey: string; mime: string }; onOpen: () => void }) {
  const { url, err } = useBlob(m.storageKey);
  if (err) return <div className="grid h-24 w-24 place-items-center rounded border border-line text-xs text-muted">Unavailable</div>;
  if (!url) return <div className="h-24 w-24 animate-pulse rounded bg-navy-100" />;
  return m.mime.startsWith('image/') ? <button onClick={onOpen} aria-label="Open photo"><img src={url} alt="Report evidence" className="h-24 w-24 rounded border border-line object-cover" /></button> : <a href={url} target="_blank" rel="noreferrer" className="grid h-24 w-24 place-items-center rounded border border-line text-xs font-semibold text-info">{m.mime === 'video/mp4' ? 'Video' : 'PDF'}</a>;
}
export function MediaViewer({ media }: { media: { id: string; storageKey: string; mime: string }[] }) {
  const [open, setOpen] = useState<string | null>(null); const big = useBlob(open);
  if (!media.length) return <p className="text-sm text-muted">No media attached.</p>;
  return <><div className="flex flex-wrap gap-2">{media.map(m => <Thumb key={m.id} m={m} onOpen={() => setOpen(m.storageKey)} />)}</div>
    <Dialog open={!!open} onClose={() => setOpen(null)} title="Evidence" wide>{big.url ? <img src={big.url} alt="Report evidence, full size" className="max-h-[70vh] w-full object-contain" /> : <p className="text-sm text-muted">Loading…</p>}</Dialog></>;
}
