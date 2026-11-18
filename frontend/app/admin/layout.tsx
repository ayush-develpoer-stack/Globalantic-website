import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/Toast';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/**
 * Minimal layout for the admin area. It deliberately renders no marketing
 * chrome (Navbar/Footer) — those live only in the (marketing) route group.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className={styles.adminRoot}>{children}</div>
    </ToastProvider>
  );
}
