import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider, ThemeScript, ToastProvider, logoSrc } from '@globalantic/ui';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SITE_URL, isIndexable, trainingOrgSchema } from '@/lib/seo';
import '@globalantic/ui/styles/globals.css';
import { jsonLd } from '@/lib/json-ld';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans', weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  icons: { icon: logoSrc },
  metadataBase: new URL(SITE_URL),
  title: { default: 'Globalantic Training', template: '%s | Globalantic Training' },
  description: 'Training programmes, internships, batches, fees and admissions at Globalantic.',
  openGraph: { type: 'website', siteName: 'Globalantic Training', locale: 'en_IN' },
  // Default for pages without their own metadata; public pages set canonical + robots via pageMeta.
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0a1a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline theme script sets data-theme before hydration.
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(trainingOrgSchema()) }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <SiteHeader />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <SiteFooter />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
