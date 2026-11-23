import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
export const metadata: Metadata = { title: { default: 'KOSEMA Command Centre | Kogi State', template: '%s · KOSEMA Command Centre' }, description: 'Kogi State emergency coordination for reports, response teams, relief and shelter operations.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-NG"><body><Providers>{children}</Providers></body></html>;
}
