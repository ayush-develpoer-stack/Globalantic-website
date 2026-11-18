'use client';

import { CalendarCheck, CalendarDays, ClipboardList, FileText, FolderKanban, LayoutDashboard, LifeBuoy, Megaphone, NotebookPen, UserRound } from 'lucide-react';
import { PortalShell, RequireSession, type NavSection } from '@globalantic/ui';

const sections: NavSection[] = [
  { items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Time',
    items: [
      { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { href: '/leave', label: 'Leave', icon: CalendarDays },
    ],
  },
  {
    title: 'Work',
    items: [
      { href: '/tasks', label: 'My tasks', icon: ClipboardList },
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/work-updates', label: 'Work updates', icon: NotebookPen },
    ],
  },
  {
    title: 'HR',
    items: [
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/hr-requests', label: 'HR requests', icon: LifeBuoy },
      { href: '/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/profile', label: 'Profile', icon: UserRound },
    ],
  },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession roles={['EMPLOYEE']} portalName="employee portal">
      <PortalShell brand="Employee Portal" sections={sections}>
        {children}
      </PortalShell>
    </RequireSession>
  );
}
