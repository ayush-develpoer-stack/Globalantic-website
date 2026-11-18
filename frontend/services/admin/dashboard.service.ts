import { isMockMode } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { getMockStore } from '@/lib/mock/store';
import { clone, failIfErrorScenario, isEmptyScenario, simulateLatency } from '@/lib/mock/runtime';
import type { DashboardData } from '@/types';

/** Admin dashboard summary (counts + five most recent contact leads). */

const EMPTY: DashboardData = {
  stats: {
    totalLeads: 0,
    newLeads: 0,
    trainingApplications: 0,
    careerApplications: 0,
    portfolioProjects: 0,
    publishedPosts: 0,
    subscribers: 0,
  },
  recentLeads: [],
};

// MOCK MODE: computed from the in-memory store, the way the API counts rows.
const mock = {
  async get(): Promise<DashboardData> {
    await simulateLatency();
    failIfErrorScenario();
    if (isEmptyScenario()) return clone(EMPTY);
    const s = getMockStore();
    return clone({
      stats: {
        totalLeads: s.contacts.length,
        newLeads: s.contacts.filter((c) => c.status === 'NEW').length,
        trainingApplications: s.training.length,
        careerApplications: s.careers.length,
        portfolioProjects: s.cms.portfolio.length,
        publishedPosts: s.cms.blog.filter((p) => p.published).length,
        subscribers: s.newsletter.filter((n) => n.status === 'SUBSCRIBED').length,
      },
      recentLeads: [...s.contacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    });
  },
};

const api: typeof mock = {
  get: () => http.get<DashboardData>('/admin/dashboard'),
};

export const dashboardService = isMockMode ? mock : api;

