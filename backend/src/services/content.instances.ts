import { createContentService } from './content.factory';

export const serviceContent = createContentService('service', {
  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  searchFields: ['title', 'slug', 'shortDesc'],
});

export const solutionContent = createContentService('solution', {
  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  searchFields: ['title', 'slug', 'shortDesc'],
});

export const industryContent = createContentService('industry', {
  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  searchFields: ['title', 'slug', 'shortDesc'],
});

export const portfolioContent = createContentService('portfolioProject', {
  orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  searchFields: ['title', 'slug', 'shortDescription', 'category'],
  archivable: true,
  scheduled: true,
});

export const blogContent = createContentService('blogPost', {
  orderBy: { publishedAt: 'desc' },
  include: { category: true },
  searchFields: ['title', 'slug', 'excerpt'],
  archivable: true,
  scheduled: true,
});
