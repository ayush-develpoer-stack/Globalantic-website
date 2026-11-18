import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await prisma.siteSetting.findFirst();
  // Expose only public-safe fields.
  sendSuccess(res, {
    companyName: settings?.companyName ?? 'Globalantic',
    logoUrl: settings?.logoUrl ?? null,
    email: settings?.email ?? 'hello@globalantic.com',
    secondaryEmail: settings?.secondaryEmail ?? null,
    phone: settings?.phone ?? '',
    whatsapp: settings?.whatsapp ?? '',
    address: settings?.address ?? 'Bhopal, India',
    facebookUrl: settings?.facebookUrl ?? null,
    instagramUrl: settings?.instagramUrl ?? null,
    linkedinUrl: settings?.linkedinUrl ?? null,
    twitterUrl: settings?.twitterUrl ?? null,
    youtubeUrl: settings?.youtubeUrl ?? null,
    footerDescription: settings?.footerDescription ?? '',
    ctaText: settings?.ctaText ?? 'Get Free Consultation',
    // Map is shown only when an admin configured the verified office location.
    mapUrl: settings?.mapUrl ?? null,
    mapEmbedUrl: settings?.mapEmbedUrl ?? null,
  });
});

export const listTechnologies = asyncHandler(async (_req: Request, res: Response) => {
  const items = await prisma.technology.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  sendSuccess(res, items);
});

export const listFaqs = asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const items = await prisma.fAQ.findMany({
    where: category ? { category } : undefined,
    orderBy: { order: 'asc' },
  });
  sendSuccess(res, items);
});

export const listBlogCategories = asyncHandler(async (_req: Request, res: Response) => {
  const items = await prisma.blogCategory.findMany({ orderBy: { name: 'asc' } });
  sendSuccess(res, items);
});
