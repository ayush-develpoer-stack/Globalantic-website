import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { siteConfig } from '@/lib/config';
import { isIndexable } from '@/lib/seo';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { themeScript } from './theme-script';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.homeTitle,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  authors: [{ name: siteConfig.name }],
  publisher: siteConfig.name,
  // Safety net for pages without their own metadata; buildMetadata sets per-page robots.
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  // Search Console / Bing Webmaster verification tokens (public by design). Unset = no tag.
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
  },
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    url: siteConfig.url,
    title: siteConfig.homeTitle,
    locale: 'en_IN',
    description: siteConfig.description,
  },
  twitter: { card: 'summary_large_image' },
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
    // suppressHydrationWarning: the inline theme script sets data-theme on
    // <html> before React hydrates, which is intentional.
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
