'use client';

import {
  Award,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  Gift,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Receipt,
  Trophy,
  User,
} from 'lucide-react';
import { PortalShell, RequireSession, type NavItem, type NavSection } from '@globalantic/ui';

// packages/ui types NavItem.icon narrowly (size: number); lucide icons are compatible at runtime.
const icon = (c: unknown) => c as NavItem['icon'];

const sections: NavSection[] = [
  { items: [{ href: '/', label: 'Dashboard', icon: icon(LayoutDashboard) }] },
  {
    title: 'Admissions',
    items: [
      { href: '/applications', label: 'Applications', icon: icon(FileText) },
      { href: '/exams', label: 'Internship exams', icon: icon(ClipboardCheck) },
      { href: '/payments', label: 'Payments & receipts', icon: icon(Receipt) },
    ],
  },
  {
    title: 'Learning',
    items: [
      { href: '/enrollments', label: 'My courses', icon: icon(GraduationCap) },
      { href: '/program', label: 'Certificate program', icon: icon(BadgeCheck) },
      { href: '/timetable', label: 'Timetable', icon: icon(CalendarDays) },
      { href: '/attendance', label: 'Attendance', icon: icon(CalendarCheck) },
      { href: '/materials', label: 'Materials', icon: icon(FolderOpen) },
      { href: '/assignments', label: 'Assignments', icon: icon(ClipboardList) },
      { href: '/results', label: 'Results', icon: icon(Trophy) },
      { href: '/feedback', label: 'Feedback', icon: icon(MessageSquare) },
      { href: '/certificates', label: 'Certificates', icon: icon(Award) },
    ],
  },
  {
    title: 'Updates',
    items: [
      { href: '/announcements', label: 'Announcements', icon: icon(Megaphone) },
      { href: '/notifications', label: 'Notifications', icon: icon(Bell) },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/referrals', label: 'Refer & earn', icon: icon(Gift) },
      { href: '/profile', label: 'Profile', icon: icon(User) },
      { href: '/support', label: 'Help & support', icon: icon(LifeBuoy) },
    ],
  },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession roles={['STUDENT']} portalName="student portal">
      <PortalShell brand="Student portal" sections={sections}>
        {children}
      </PortalShell>
    </RequireSession>
  );
}

