import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/footer/Footer';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main">
        <div style={{ minHeight: '64vh', display: 'grid', placeItems: 'center', padding: '48px 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 520 }}>
            <p className="eyebrow">404</p>
            <h1 style={{ margin: '8px 0 14px' }}>Page not found</h1>
            <p style={{ marginBottom: 28 }}>
              The page you are looking for doesn&apos;t exist or has been moved.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button href="/">Back to home</Button>
              <Button variant="outline" href="/contact">
                Contact us
              </Button>
            </div>
            <p style={{ marginTop: 28 }}>
              Or explore our <Link href="/services" style={{ color: 'var(--primary-text)', fontWeight: 600 }}>services</Link>.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
