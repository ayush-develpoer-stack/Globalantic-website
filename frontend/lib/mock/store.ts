import type {
  AdminSettings,
  CareerApplication,
  CmsRecord,
  CmsResource,
  Faq,
  ContactLead,
  NewsletterSubscriber,
  TrainingApplication,
} from '@/types';
import {
  buildBlogPosts,
  buildFaqs,
  buildIndustries,
  buildPortfolio,
  buildServices,
  buildSettings,
  buildSolutions,
} from './content';
import { careerApplications, contactLeads, newsletterSubscribers, trainingApplications } from './fixtures/leads';
import { clone } from './runtime';

/**
 * MOCK MODE in-memory database.
 *
 * One store per JavaScript runtime: in the browser it lives for the tab's
 * session (survives client-side navigation, resets on full reload). Nothing is
 * written to localStorage, so mock edits can never leak into another session.
 * `resetMockStore()` restores the fixtures (used by tests).
 */
export interface MockStore {
  cms: Record<CmsResource, CmsRecord[]>;
  contacts: ContactLead[];
  training: TrainingApplication[];
  careers: CareerApplication[];
  newsletter: NewsletterSubscriber[];
  settings: AdminSettings;
  faqs: Faq[];
}

const SEEDED_AT = '2026-09-21T04:33:21.000Z';

/** CMS rows as the admin API returns them (with timestamps). */
function asRecords(items: object[]): CmsRecord[] {
  return (clone(items) as unknown as CmsRecord[]).map((item) => ({
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...item,
  }));
}

function freshStore(): MockStore {
  return {
    cms: {
      services: asRecords(buildServices()),
      solutions: asRecords(buildSolutions()),
      industries: asRecords(buildIndustries()),
      portfolio: asRecords(buildPortfolio()),
      blog: asRecords(buildBlogPosts()),
    },
    contacts: clone(contactLeads),
    training: clone(trainingApplications),
    careers: clone(careerApplications),
    newsletter: clone(newsletterSubscribers),
    settings: buildSettings(),
    faqs: clone(buildFaqs()),
  };
}

let store: MockStore | null = null;

export function getMockStore(): MockStore {
  if (!store) store = freshStore();
  return store;
}

export function resetMockStore(): void {
  store = freshStore();
}
