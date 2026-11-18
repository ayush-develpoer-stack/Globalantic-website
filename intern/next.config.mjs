/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional separate build dir (e.g. a verification instance next to a running dev server).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Shared workspace packages ship TypeScript source.
  transpilePackages: ['@globalantic/ui', '@globalantic/api-client', '@globalantic/types'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Private portal: no page may ever be indexed (personal data, records, results).
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
