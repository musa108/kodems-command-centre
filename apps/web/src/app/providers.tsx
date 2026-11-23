'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 } } }));
  return <QueryClientProvider client={qc}><AuthProvider>{children}<Toaster position="top-right" richColors closeButton /></AuthProvider></QueryClientProvider>;
}
