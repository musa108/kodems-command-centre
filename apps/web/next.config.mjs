/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const API_PROXY_URL = process.env.API_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'upload.wikimedia.org', pathname: '/wikipedia/commons/**' }] },
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; },
  async rewrites() {
    const target = API_PROXY_URL.replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
