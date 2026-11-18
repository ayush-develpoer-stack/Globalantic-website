'use client';

import { LayoutDashboard } from 'lucide-react';
import { PortalShell, RequireSession, type NavSection } from '@globalantic/ui';

const sections: NavSection[] = [{ items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] }];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession roles={['TRAINER']} portalName="trainer portal">
      <PortalShell brand="Trainer Portal" sections={sections}>
        {children}
      </PortalShell>
    </RequireSession>
  );
}
