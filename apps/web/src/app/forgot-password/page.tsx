'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/layout/shell';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

export default function Forgot() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [dev, setDev] = useState<string | undefined>(); const [busy, setBusy] = useState(false);
  return <main className="grid min-h-screen place-items-center bg-gradient-to-b from-white to-navy-50 p-4"><div className="w-full max-w-md"><div className="mb-6 flex justify-center"><Logo /></div><div className="card p-6"><h1 className="h1 mb-1">Reset your password</h1>
    {done ? <div className="space-y-3 text-sm"><p>If an account exists for that email, a reset link has been issued. Email delivery requires the email provider to be configured by your administrator.</p>{dev && <p className="rounded bg-gold-50 p-2 text-xs text-gold-600">Development environment only: <Link className="font-semibold underline" href={`/reset-password?token=${dev}`}>open reset link</Link></p>}<Link href="/login" className="font-semibold text-info">Back to sign in</Link></div>
      : <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const r = await api.auth.forgot(email); setDev(r.devToken); } finally { setBusy(false); setDone(true); } }}>
        <div><label htmlFor="e" className="label">Email</label><input id="e" type="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} /></div><Button type="submit" loading={busy} className="w-full">Send reset link</Button></form>}</div></div></main>;
}
