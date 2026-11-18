import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCareerNotification } from '../services/email.service';
import { emitAdminEvent } from '../services/admin-events.service';

export const submitCareer = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;

  const application = await prisma.careerApplication.create({
    data: {
      name: b.name as string,
      email: b.email as string,
      phone: (b.phone as string) || null,
      position: b.position as string,
      resumeUrl: (b.resumeUrl as string) || null,
      portfolioUrl: (b.portfolioUrl as string) || null,
      message: (b.message as string) || null,
    },
  });

  // Best-effort email; the application is already persisted.
  try {
    await emitAdminEvent(
      {
        dedupeKey: `career.application:${application.id}`,
        category: 'hr',
        severity: 'important',
        title: `New career application: ${application.position}`,
        body: `${application.name} applied for ${application.position}`,
        link: `${env.mainSiteUrl}/admin/dashboard/careers`,
        entityType: 'CareerApplication',
        entityId: application.id,
        audience: 'employees.manage',
      },
      (to) => sendCareerNotification({ id: application.id, name: application.name, email: application.email, position: application.position, phone: application.phone }, to),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[career] notification email failed:', err);
  }

  sendSuccess(res, { id: application.id }, 'Your application has been submitted. Thank you!', 201);
});

// ---- Admin ----

export const listCareers = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const items = await prisma.careerApplication.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { position: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, items);
});

export const updateCareerStatus = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.careerApplication.update({
    where: { id: req.params.id },
    data: { status: (req.body as { status: string }).status as never },
  });
  sendSuccess(res, item, 'Status updated');
});

export const deleteCareer = asyncHandler(async (req: Request, res: Response) => {
  await prisma.careerApplication.delete({ where: { id: req.params.id } });
  sendSuccess(res, { id: req.params.id }, 'Deleted');
});
