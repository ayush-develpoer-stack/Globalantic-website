'use client';

import Link from 'next/link';
import {
  Briefcase,
  FolderKanban,
  GraduationCap,
  Mail,
  Newspaper,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminShell';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { contactStatusTone } from '@/components/admin/leadConfigs';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/StateView';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { formatDate, orDash } from '@/lib/format';
import { dashboardService } from '@/services/admin/dashboard.service';
import type { ContactLead, DashboardStats } from '@/types';
import styles from '../admin.module.css';

interface StatCardDef {
  key: keyof DashboardStats;
  label: string;
  icon: LucideIcon;
  href: string;
}

const STAT_CARDS: StatCardDef[] = [
  { key: 'totalLeads', label: 'Total leads', icon: Users, href: '/admin/dashboard/contacts' },
  { key: 'newLeads', label: 'New leads', icon: UserPlus, href: '/admin/dashboard/contacts?status=NEW' },
  { key: 'trainingApplications', label: 'Training applications', icon: GraduationCap, href: '/admin/dashboard/training' },
  { key: 'careerApplications', label: 'Career applications', icon: Briefcase, href: '/admin/dashboard/careers' },
  { key: 'portfolioProjects', label: 'Portfolio projects', icon: FolderKanban, href: '/admin/dashboard/portfolio' },
  { key: 'publishedPosts', label: 'Published blog posts', icon: Newspaper, href: '/admin/dashboard/blog?status=PUBLISHED' },
  { key: 'subscribers', label: 'Active subscribers', icon: Mail, href: '/admin/dashboard/newsletter?status=SUBSCRIBED' },
];

/** Bars in the activity overview; colours come from the chart tokens. */
const CHART: { key: keyof DashboardStats; label: string; color: string }[] = [
  { key: 'totalLeads', label: 'Contact leads', color: 'var(--chart-1)' },
  { key: 'trainingApplications', label: 'Training applications', color: 'var(--chart-2)' },
  { key: 'careerApplications', label: 'Career applications', color: 'var(--chart-3)' },
  { key: 'subscribers', label: 'Active subscribers', color: 'var(--chart-5)' },
];

const columns: Column<ContactLead>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (r) => (
      <>
        <span className={styles.cellStrong}>{r.name}</span>
        <span className={styles.cellSub}>{r.email}</span>
      </>
    ),
  },
  { key: 'company', label: 'Company', render: (r) => orDash(r.company) },
  { key: 'service', label: 'Service', render: (r) => orDash(r.service) },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} tone={contactStatusTone(r.status)} /> },
  { key: 'createdAt', label: 'Received', render: (r) => formatDate(r.createdAt) },
];

export default function DashboardPage() {
  const { data, error, loading, reload } = useServiceQuery(() => dashboardService.get(), 'dashboard');
  const stats = data?.stats;
  const chartMax = stats ? Math.max(1, ...CHART.map((c) => stats[c.key])) : 1;

  return (
    <>
      <PageHeader title="Dashboard" description="A snapshot of website enquiries, applications and published content." />

      {error ? (
        <div className={styles.panel}>
          <ErrorState title="Could not load the dashboard" message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <section aria-label="Key figures" className={styles.statGrid}>
            {STAT_CARDS.map((card) => {
              const CardIcon = card.icon;
              return (
                <Link key={card.key} href={card.href} className={styles.statCard}>
                  <span className={styles.statIcon}>
                    <CardIcon size={22} aria-hidden />
                  </span>
                  <span className={styles.statBody}>
                    <span className={styles.statValue}>
                      {loading || !stats ? <Skeleton width={48} height={24} /> : stats[card.key]}
                    </span>
                    <span className={styles.statLabel}>{card.label}</span>
                  </span>
                </Link>
              );
            })}
          </section>

          <div className={styles.dashGrid}>
            <section className={styles.panel} aria-labelledby="recent-leads-title">
              <div className={styles.panelHead}>
                <h2 id="recent-leads-title" className={styles.panelTitle}>
                  Recent leads
                </h2>
                <Link href="/admin/dashboard/contacts" className={styles.panelLink}>
                  View all
                </Link>
              </div>
              <DataTable<ContactLead>
                caption="Five most recent contact leads"
                columns={columns}
                rows={data?.recentLeads ?? []}
                loading={loading}
                empty={<EmptyState title="No leads yet" description="New contact enquiries will appear here." />}
              />
            </section>

            <section className={styles.panel} aria-labelledby="overview-title">
              <div className={styles.panelHead}>
                <h2 id="overview-title" className={styles.panelTitle}>
                  Activity overview
                </h2>
              </div>
              <ul className={styles.chart}>
                {CHART.map((bar) => {
                  const value = stats?.[bar.key] ?? 0;
                  return (
                    <li key={bar.key} className={styles.chartRow}>
                      <span className={styles.chartLabel}>{bar.label}</span>
                      <span className={styles.chartValue}>{loading ? <Skeleton width={24} height={12} /> : value}</span>
                      <span className={styles.chartTrack} aria-hidden>
                        {!loading && (
                          <span
                            className={styles.chartBar}
                            style={{ width: `${(value / chartMax) * 100}%`, background: bar.color }}
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
