import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { audit } from '../lib/audit';
import { actorOf } from '../middleware/auth.middleware';

/** CMS FAQ management (/api/admin/faqs, ADMIN). The public list stays at GET /api/faqs. */

export const listFaqsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const items = await prisma.fAQ.findMany({ where: category ? { category } : undefined, orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  sendSuccess(res, items);
});

export const createFaq = asyncHandler(async (req: Request, res: Response) => {
  const faq = await prisma.fAQ.create({ data: req.body });
  await audit(prisma, actorOf(req), { action: 'cms.faq_created', entityType: 'FAQ', entityId: faq.id });
  sendSuccess(res, faq, 'FAQ created', 201);
});

export const updateFaq = asyncHandler(async (req: Request, res: Response) => {
  const exists = await prisma.fAQ.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('FAQ not found');
  const faq = await prisma.fAQ.update({ where: { id: req.params.id }, data: req.body });
  await audit(prisma, actorOf(req), { action: 'cms.faq_updated', entityType: 'FAQ', entityId: faq.id });
  sendSuccess(res, faq, 'FAQ updated');
});

export const deleteFaq = asyncHandler(async (req: Request, res: Response) => {
  const res2 = await prisma.fAQ.deleteMany({ where: { id: req.params.id } });
  if (!res2.count) throw ApiError.notFound('FAQ not found');
  await audit(prisma, actorOf(req), { action: 'cms.faq_deleted', entityType: 'FAQ', entityId: req.params.id });
  sendSuccess(res, { id: req.params.id }, 'FAQ deleted');
});
