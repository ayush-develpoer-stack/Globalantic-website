'use client';

import {
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Gift,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Newspaper,
  ScrollText,
  UserCircle,
  UserCog,
  Users,
  ClipboardCheck,
  ListChecks,
  Target,
  Route,
  LineChart,
  BadgeCheck,
  Building2,
  FileSignature,
  Files,
  LayoutTemplate,
  Mail,
  PieChart,
  Settings,
  UserCheck,
  PenLine,
  FolderKanban,
  Layers,
  Rocket,
  SlidersHorizontal,
  Bell,
  BellRing,
} from 'lucide-react';
import { PortalShell, RequireSession, type NavSection } from '@globalantic/ui';
import { NotificationBell } from '@/lib/notifications';

// Every item is permission-gated; the server enforces the same permissions on each API call.
const sections: NavSection[] = [
  {
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/notifications/settings', label: 'Notification settings', icon: BellRing, permission: 'notifications.settings' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/courses', label: 'Courses', icon: BookOpen, permission: 'training.courses.manage' },
      { href: '/batches', label: 'Batches', icon: CalendarDays, permission: 'training.batches.manage' },
      { href: '/trainers', label: 'Trainers', icon: GraduationCap, permission: 'training.batches.manage' },
    ],
  },
  {
    title: 'Students',
    items: [
      { href: '/applications', label: 'Admissions', icon: FileText, permission: 'training.admissions.read' },
      { href: '/students', label: 'Students', icon: Users, permission: 'training.students.read' },
      { href: '/certificates', label: 'Certificates', icon: Award, permission: 'training.certificates.issue' },
      { href: '/support', label: 'Support', icon: LifeBuoy, permission: 'training.support.manage' },
      { href: '/announcements', label: 'Announcements', icon: Megaphone, permission: 'training.announcements.manage' },
    ],
  },
  {
    title: 'Sales CRM',
    items: [
      { href: '/leads', label: 'Leads', icon: Target, permission: 'leads.manage' },
      { href: '/leads/reports', label: 'Funnel & sources', icon: LineChart, permission: 'leads.manage' },
      { href: '/leads/rules', label: 'Assignment rules', icon: Route, permission: 'users.manage' },
    ],
  },
  {
    title: 'Certificate program',
    items: [
      { href: '/programs', label: 'Programs', icon: BadgeCheck, permission: 'programs.read' },
      { href: '/programs/enrollments', label: 'Enrollments', icon: UserCheck, permission: 'programs.read' },
      { href: '/programs/report', label: 'Program report', icon: PieChart, permission: 'programs.read' },
    ],
  },
  {
    title: 'Website',
    items: [
      { href: '/website/blog', label: 'Blog posts', icon: PenLine, permission: 'cms.manage' },
      { href: '/website/projects', label: 'Projects & portfolio', icon: FolderKanban, permission: 'cms.manage' },
      { href: '/website/services', label: 'Service pages', icon: Layers, permission: 'cms.manage' },
      { href: '/website/landing-pages', label: 'Campaign landing pages', icon: Rocket, permission: 'cms.manage' },
      { href: '/website/settings', label: 'Site settings', icon: SlidersHorizontal, permission: 'users.manage' },
    ],
  },
  {
    title: 'Documents',
    items: [
      { href: '/documents', label: 'Documents', icon: Files, permission: 'documents.read' },
      { href: '/documents/new', label: 'New document', icon: FileSignature, permission: 'documents.read' },
      { href: '/documents/clients', label: 'Clients', icon: Building2, permission: 'documents.read' },
      { href: '/documents/templates', label: 'Templates', icon: LayoutTemplate, permission: 'documents.read' },
      { href: '/documents/email-log', label: 'Email log', icon: Mail, permission: 'payments.read' },
      { href: '/documents/settings', label: 'Company details', icon: Settings, permission: 'documents.settings' },
    ],
  },
  {
    title: 'Internship exams',
    items: [
      { href: '/exams', label: 'Exams & results', icon: ClipboardCheck, permission: 'exams.results.read' },
      { href: '/exams/questions', label: 'Question bank', icon: ListChecks, permission: 'exams.manage' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/payments', label: 'Payments', icon: CreditCard, permission: 'payments.read' },
      { href: '/referrals', label: 'Referrals', icon: Gift, permission: 'referrals.read' },
    ],
  },
  {
    title: 'People & HR',
    items: [
      { href: '/employees', label: 'Employees', icon: UserCircle, permission: 'employees.read' },
      { href: '/leave', label: 'Leave', icon: CalendarCheck, permission: 'leave.approve' },
      { href: '/projects', label: 'Projects & tasks', icon: Briefcase, permission: 'projects.manage' },
      { href: '/work-updates', label: 'Work updates', icon: ClipboardList, permission: 'projects.manage' },
      { href: '/hr-requests', label: 'HR requests', icon: Inbox, permission: 'hr.requests.manage' },
      { href: '/company-announcements', label: 'Company announcements', icon: Newspaper, permission: 'company.announcements.manage' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { href: '/users', label: 'Users & roles', icon: KeyRound, permission: 'users.manage' },
      { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/staff', label: 'Staff & trainers', icon: UserCog, permission: 'training.trainers.manage' },
      { href: '/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
    ],
  },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession roles={['ADMIN', 'FINANCE', 'HR', 'SALES', 'EDITOR']} portalName="admin portal">
      <PortalShell brand="Admin" sections={sections} headerExtra={<NotificationBell />}>
        {children}
      </PortalShell>
    </RequireSession>
  );
}
