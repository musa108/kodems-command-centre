'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';

export default function MfaEnrollmentPage() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true); setError('');
    try { const result = await api.auth.mfaSetup(); setSecret(result.secret); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not start MFA setup.'); }
    finally { setBusy(false); }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.auth.mfaEnable(code); router.replace('/dashboard'); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not verify that code.'); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-gradient-to-b from-white to-navy-50 p-4"><section className="card w-full max-w-lg p-6">
    <h1 className="h1">Secure your administrator account</h1>
    <p className="mt-2 text-sm text-muted">Add this account to an authenticator app before continuing. Sign in again with the generated six-digit code on future visits.</p>
    {!secret ? <Button className="mt-5" loading={busy} onClick={begin}>Set up authenticator</Button> : <form className="mt-5 space-y-4" onSubmit={enable}>
      <div><p className="label">Setup key</p><code className="block break-all rounded-md bg-navy-50 p-3 text-sm">{secret}</code><p className="mt-2 text-xs text-muted">Enter this key manually in your authenticator app and choose time-based verification.</p></div>
      <div><label htmlFor="code" className="label">6-digit verification code</label><input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify and continue</Button>
    </form>}
    {error && !secret && <p role="alert" className="mt-3 text-sm text-crit">{error}</p>}
  </section></main>;
}
