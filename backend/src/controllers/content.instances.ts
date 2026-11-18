import { createContentController } from './content.controller';
import {
  serviceContent,
  solutionContent,
  industryContent,
  portfolioContent,
  blogContent,
} from '../services/content.instances';

export const serviceCtrl = createContentController(serviceContent, { entity: 'Service' });
export const solutionCtrl = createContentController(solutionContent, { entity: 'Solution' });
export const industryCtrl = createContentController(industryContent, { entity: 'Industry' });
export const portfolioCtrl = createContentController(portfolioContent, {
  entity: 'PortfolioProject',
  trackPublishedAt: true,
  // Client name and outcome are published only when the client approved it.
  publicTransform: (p) => (p.clientApproved ? p : { ...p, client: null, outcome: null }),
  // /api/portfolio?service=web-development -> projects that delivered that service
  publicFilter: (q) => (typeof q.service === 'string' && /^[a-z0-9-]{1,160}$/.test(q.service) ? { services: { array_contains: [q.service] } } : undefined),
});
export const blogCtrl = createContentController(blogContent, {
  entity: 'BlogPost',
  trackPublishedAt: true,
  nullableFields: ['categoryId'],
});
