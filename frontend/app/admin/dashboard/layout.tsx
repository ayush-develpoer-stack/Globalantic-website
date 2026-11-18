'use client';

import { AdminSessionProvider } from '@/components/admin/AdminSession';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * Persistent dashboard layout: the session is resolved once and the shell
 * (sidebar, topbar) stays mounted while pages change.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}
