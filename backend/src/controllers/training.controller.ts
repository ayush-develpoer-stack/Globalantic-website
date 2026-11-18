import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import {
  sendTrainingAcknowledgement,
  sendTrainingNotification,
} from '../services/email.service';
import { emitAdminEvent } from '../services/admin-events.service';

export const submitTraining = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;

  const application = await prisma.trainingApplication.create({
    data: {
      fullName: b.fullName as string,
      phone: b.phone as string,
      whatsapp: (b.whatsapp as string) || null,
      email: b.email as string,
      age: (b.age as number) ?? null,
      qualification: b.qualification as string,
      college: (b.college as string) || null,
      city: (b.city as string) || null,
      mode: b.mode as never,
      codingExperience: (b.codingExperience as string) || null,
      whyJoin: (b.whyJoin as string) || null,
      preferredContactTime: (b.preferredContactTime as string) || null,
    },
  });

  // Email is best-effort: the application is already stored, so a transport
  // failure must not fail the request or trigger a duplicate resubmission.
  try {
    await emitAdminEvent(
      {
        dedupeKey: `training.application:${application.id}`,
        category: 'training',
        severity: 'important',
        title: `New training application: ${application.fullName}`,
        body: `Mode: ${application.mode} · ${application.qualification}`,
        link: `${env.mainSiteUrl}/admin/dashboard/training`,
        entityType: 'TrainingApplication',
        entityId: application.id,
      },
      (to) =>
        sendTrainingNotification(
          { id: application.id, fullName: application.fullName, email: application.email, phone: application.phone, mode: application.mode, qualification: application.qualification, city: application.city },
          to,
        ),
    );
    await sendTrainingAcknowledgement({
      fullName: application.fullName,
      email: application.email,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[training] notification email failed:', err);
  }

  sendSuccess(
    res,
    { id: application.id },
    'Your application has been received. Our team will contact you soon.',
    201,
  );
});

// ---- Admin ----

export const listTraining = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const items = await prisma.trainingApplication.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, items);
});

export const updateTrainingStatus = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.trainingApplication.update({
    where: { id: req.params.id },
    data: { status: (req.body as { status: string }).status as never },
  });
  sendSuccess(res, item, 'Status updated');
});

export const deleteTraining = asyncHandler(async (req: Request, res: Response) => {
  await prisma.trainingApplication.delete({ where: { id: req.params.id } });
  sendSuccess(res, { id: req.params.id }, 'Deleted');
});
