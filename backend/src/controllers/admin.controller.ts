import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const dashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalLeads,
    newLeads,
    trainingApplications,
    careerApplications,
    portfolioProjects,
    publishedPosts,
    subscribers,
  ] = await Promise.all([
    prisma.contactLead.count(),
    prisma.contactLead.count({ where: { status: 'NEW' } }),
    prisma.trainingApplication.count(),
    prisma.careerApplication.count(),
    prisma.portfolioProject.count(),
    prisma.blogPost.count({ where: { published: true } }),
    prisma.newsletterSubscriber.count({ where: { status: 'SUBSCRIBED' } }),
  ]);

  const recentLeads = await prisma.contactLead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  sendSuccess(res, {
    stats: {
      totalLeads,
      newLeads,
      trainingApplications,
      careerApplications,
      portfolioProjects,
      publishedPosts,
      subscribers,
    },
    recentLeads,
  });
});
