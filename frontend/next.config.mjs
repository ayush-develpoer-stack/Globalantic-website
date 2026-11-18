import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The monorepo root, but only when this app actually sits inside it. Deployed on its own
 * (e.g. Vercel cloning Globalantic-website-frontend into /vercel/path0), '..' is unrelated,
 * and tracing from it makes Vercel look for .next under /vercel/path0/path0.
 */
function monorepoRoot() {
  const parent = new URL('..', import.meta.url);
  try {
    const pkg = JSON.parse(readFileSync(new URL('package.json', parent), 'utf8'));
    return Array.isArray(pkg.workspaces) && pkg.workspaces.includes('frontend') ? fileURLToPath(parent) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Images uploaded through the CMS are served by the API's public image store
 * (<NEXT_PUBLIC_API_URL>/files/public/<id>), so next/image must allow that origin.
 */
function apiImagePattern() {
  const raw = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000/api');
  if (!raw) return null;
  try {
    const api = new URL(raw);
    return {
      protocol: api.protocol.replace(':', ''),
      hostname: api.hostname,
      ...(api.port ? { port: api.port } : {}),
      pathname: `${api.pathname.replace(/\/+$/, '')}/files/public/**`,
    };
  } catch {
    return null;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional separate build dir (e.g. a verification instance next to a running dev server).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Monorepo root (shared packages/ and the root lockfile); an old frontend/package-lock.json would otherwise confuse tracing.
  ...(monorepoRoot() ? { outputFileTracingRoot: monorepoRoot() } : {}),
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      ...[apiImagePattern()].filter(Boolean),
    ],
  },
  // Short campaign-friendly URLs -> canonical service pages.
  async redirects() {
    return [
      { source: '/services/ai-automation', destination: '/services/ai-solutions', permanent: true },
      { source: '/services/web-app-development', destination: '/services/web-application-development', permanent: true },
      { source: '/services/api-development', destination: '/services/api-integration', permanent: true },
      { source: '/services/maintenance', destination: '/services/website-maintenance', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // The embedded admin is never indexed, even if a URL to it leaks (header beats robots.txt).
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // Blog draft previews (staff-only): never indexed or cached by shared caches.
      { source: '/blog/preview/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};

export default nextConfig;
