import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { actorOf } from '../middleware/auth.middleware';
import { audit } from '../lib/audit';
import { AWAITING_APPROVAL, assertNotLive, canPublish, stripLiveFields } from '../lib/editorial';

/**
 * CMS extras: blog categories and campaign landing pages (/lp/[slug]).
 * Landing pages only add a focused headline, benefits and CTA on top of a real service —
 * the service's own content, FAQs and enquiry form are reused, so no offer is invented.
 */

const log = (req: Request, action: string, entityType: string, entityId: string) => audit(prisma, actorOf(req), { action, entityType, entityId });

// ---- Blog categories ------------------------------------------------------

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await prisma.blogCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { posts: true } } } }));
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const c = await prisma.blogCategory.create({ data: { name: req.body.name, slug: req.body.slug } });
  await log(req, 'blog_category.created', 'BlogCategory', c.id);
  sendSuccess(res, c, 'Category created', 201);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const c = await prisma.blogCategory.update({ where: { id: req.params.id }, data: { name: req.body.name, slug: req.body.slug } });
  await log(req, 'blog_category.updated', 'BlogCategory', c.id);
  sendSuccess(res, c, 'Category saved');
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  // Posts keep existing; their category is cleared (FK onDelete: SetNull).
  await prisma.blogCategory.delete({ where: { id: req.params.id } });
  await log(req, 'blog_category.deleted', 'BlogCategory', req.params.id);
  sendSuccess(res, { id: req.params.id }, 'Category deleted');
});

// ---- Landing pages --------------------------------------------------------

async function assertService(slug: string | undefined) {
  if (slug === undefined) return;
  const s = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
  if (!s) throw ApiError.validation([{ field: 'serviceSlug', message: 'Choose an existing service' }]);
}

export const listLandingPages = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await prisma.landingPage.findMany({ orderBy: { updatedAt: 'desc' } }));
});

export const getLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.landingPage.findUnique({ where: { id: req.params.id } });
  if (!p) throw ApiError.notFound('Landing page not found');
  sendSuccess(res, p);
});

export const createLandingPage = asyncHandler(async (req: Request, res: Response) => {
  await assertService(req.body.serviceSlug);
  const asked = !canPublish(req) && stripLiveFields(req.body);
  const p = await prisma.landingPage.create({ data: { ...req.body, priceNote: req.body.priceNote || null, ...(canPublish(req) ? {} : { published: false }) } });
  await log(req, 'landing_page.created', 'LandingPage', p.id);
  sendSuccess(res, p, asked ? AWAITING_APPROVAL : 'Landing page created', 201);
});

export const updateLandingPage = asyncHandler(async (req: Request, res: Response) => {
  await assertService(req.body.serviceSlug);
  const current = await prisma.landingPage.findUnique({ where: { id: req.params.id } });
  if (!current) throw ApiError.notFound('Landing page not found');
  let asked = false;
  if (!canPublish(req)) {
    assertNotLive(current);
    asked = stripLiveFields(req.body);
  }
  if (req.body.published === true && current.archivedAt) throw ApiError.conflict('Archived pages cannot be published');
  const p = await prisma.landingPage.update({ where: { id: req.params.id }, data: { ...req.body, ...(req.body.priceNote !== undefined ? { priceNote: req.body.priceNote || null } : {}) } });
  await log(req, 'landing_page.updated', 'LandingPage', p.id);
  sendSuccess(res, p, asked ? AWAITING_APPROVAL : 'Landing page saved');
});

export const archiveLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.landingPage.update({ where: { id: req.params.id }, data: { archivedAt: new Date(), published: false } });
  await log(req, 'landing_page.archived', 'LandingPage', p.id);
  sendSuccess(res, p, 'Archived');
});

export const deleteLandingPage = asyncHandler(async (req: Request, res: Response) => {
  if (!canPublish(req)) assertNotLive(await prisma.landingPage.findUnique({ where: { id: req.params.id } }));
  await prisma.landingPage.delete({ where: { id: req.params.id } });
  await log(req, 'landing_page.deleted', 'LandingPage', req.params.id);
  sendSuccess(res, { id: req.params.id }, 'Deleted');
});

/** Public: a published landing page with its (published) service. */
export const getPublicLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.landingPage.findUnique({ where: { slug: req.params.slug } });
  if (!p || !p.published || p.archivedAt) throw ApiError.notFound('Page not found');
  const service = await prisma.service.findFirst({ where: { slug: p.serviceSlug, published: true } });
  if (!service) throw ApiError.notFound('Page not found');
  sendSuccess(res, { ...p, service });
});
