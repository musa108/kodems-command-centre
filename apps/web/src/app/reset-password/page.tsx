'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/layout/shell';
import { Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function Form() {
  const token = useSearchParams().get('token') ?? ''; const router = useRouter(); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const weak = pw.length < 12 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw);
  return <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(null); try { await api.auth.reset(token, pw); router.replace('/login'); } catch (x) { setErr(x instanceof ApiError ? (Object.values(x.fieldErrors)[0]?.[0] ?? x.message) : 'Failed'); } finally { setBusy(false); } }}>
    <div><label htmlFor="p" className="label">New password</label><input id="p" type="password" autoComplete="new-password" className="input" value={pw} onChange={e => setPw(e.target.value)} /><p className="mt-1 text-xs text-muted">At least 12 characters with upper-case, lower-case and a digit.</p></div>
    {err && <p role="alert" className="rounded bg-crit-bg p-2 text-sm text-crit">{err}</p>}<Button type="submit" disabled={weak || !token} loading={busy} className="w-full">Set new password</Button><Link href="/login" className="block text-center text-sm font-semibold text-info">Back to sign in</Link></form>;
}
export default function Reset() { return <main className="grid min-h-screen place-items-center bg-gradient-to-b from-white to-navy-50 p-4"><div className="w-full max-w-md"><div className="mb-6 flex justify-center"><Logo /></div><div className="card p-6"><h1 className="h1 mb-4">Choose a new password</h1><Suspense><Form /></Suspense></div></div></main>; }
