'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Logo } from '@/components/layout/shell';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

const schema = z.object({ email: z.string().min(1, 'Email is required').email('Enter a valid email address'), password: z.string().min(1, 'Password is required'), mfaCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code').optional().or(z.literal('')) });
function LoginForm() {
  const { login, status } = useAuth(); const router = useRouter(); const sp = useSearchParams(); const [error, setError] = useState<string | null>(null); const [needMfa, setNeedMfa] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (status === 'authed') router.replace('/dashboard');
  return <form noValidate className="space-y-4" onSubmit={handleSubmit(async v => {
    setError(null);
    try { const result = await login(v.email, v.password, v.mfaCode || undefined); router.replace(result.mfaEnrolmentRequired ? '/mfa-enrollment' : '/dashboard'); }
    catch (e) { if (e instanceof ApiError && e.code === 'MFA_REQUIRED') { setNeedMfa(true); setError('Enter the code from your authenticator app.'); } else setError(e instanceof ApiError ? e.message : 'Sign-in failed'); }
  })}>
    {sp.get('expired') && <p role="status" className="rounded-md bg-warn-bg p-3 text-sm text-warn">Your session expired. Please sign in again.</p>}
    <div><label htmlFor="email" className="label">Email</label><input id="email" type="email" autoComplete="username" className="input" aria-invalid={!!errors.email} {...register('email')} />{errors.email && <p role="alert" className="mt-1 text-xs text-crit">{errors.email.message}</p>}</div>
    <div><label htmlFor="password" className="label">Password</label><input id="password" type="password" autoComplete="current-password" className="input" aria-invalid={!!errors.password} {...register('password')} />{errors.password && <p role="alert" className="mt-1 text-xs text-crit">{errors.password.message}</p>}</div>
    {needMfa && <div><label htmlFor="mfa" className="label">Authenticator code</label><input id="mfa" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="input" {...register('mfaCode')} />{errors.mfaCode && <p role="alert" className="mt-1 text-xs text-crit">{errors.mfaCode.message}</p>}</div>}
    {error && <p role="alert" className="rounded-md bg-crit-bg p-3 text-sm text-crit">{error}</p>}
    <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
    <p className="text-center text-sm"><Link href="/forgot-password" className="font-semibold text-info hover:underline">Forgot password?</Link></p></form>;
}
export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center bg-gradient-to-b from-white to-navy-50 p-4"><div className="w-full max-w-md"><div className="mb-6 flex justify-center"><Logo /></div>
    <div className="card p-6"><h1 className="h1 mb-1">Sign in</h1><p className="mb-5 text-sm text-muted">Authorised KOSEMA personnel only. Sign-ins are recorded.</p><Suspense><LoginForm /></Suspense></div>
    <p className="mt-4 text-center text-xs text-muted"><Link href="/" className="hover:underline">← Back to home</Link></p></div></main>;
}
