'use client';
import { Button, ErrorState } from '@/components/ui';
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) { return <div className="card"><ErrorState error={error} /><div className="pb-6 text-center"><Button onClick={reset}>Try again</Button></div></div>; }
