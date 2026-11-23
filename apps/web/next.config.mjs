/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];
const nextConfig = { output: 'standalone', poweredByHeader: false, reactStrictMode: true, eslint: { ignoreDuringBuilds: false }, images: { remotePatterns: [{ protocol: 'https', hostname: 'upload.wikimedia.org', pathname: '/wikipedia/commons/**' }] }, async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; } };
export default nextConfig;
