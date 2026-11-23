export const fmtDate = (d?: string | Date | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }) : '—';
export const fmtDay = (d?: string | Date | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : '—';
export const fmtNum = (n?: number | null) => n == null ? '—' : new Intl.NumberFormat('en-NG').format(n);
export const fmtMinutes = (m?: number | null) => m == null ? 'No data' : m < 60 ? `${m.toFixed(m < 10 ? 1 : 0)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
export const ago = (d?: string | Date | null, now = Date.now()) => { if (!d) return '—'; const s = Math.max(0, (now - +new Date(d)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`; };
export const humanize = (s?: string | null) => s ? s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '—';
export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as const;
