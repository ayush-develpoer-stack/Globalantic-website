import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider, ThemeScript, ToastProvider, logoSrc } from '@globalantic/ui';
import '@globalantic/ui/styles/globals.css';
import './print.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans', weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  icons: { icon: logoSrc },
  title: { default: 'Student Portal', template: '%s | Globalantic Student Portal' },
  description: 'Globalantic Training student and intern portal.',
  robots: { index: false, follow: false },
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
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
