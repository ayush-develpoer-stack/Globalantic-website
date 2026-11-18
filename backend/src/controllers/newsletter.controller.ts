import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { sendNewsletterConfirmation } from '../services/email.service';

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const email = (req.body as { email: string }).email.toLowerCase();

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

  if (existing && existing.status === 'SUBSCRIBED') {
    sendSuccess(res, { email }, 'You are already subscribed.');
    return;
  }

  await prisma.newsletterSubscriber.upsert({
    where: { email },
    update: { status: 'SUBSCRIBED' },
    create: { email, status: 'SUBSCRIBED' },
  });

  // Best-effort confirmation email; the subscription is already stored.
  try {
    await sendNewsletterConfirmation(email);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[newsletter] confirmation email failed:', err);
  }

  sendSuccess(res, { email }, 'Subscribed successfully.', 201);
});

// ---- Admin ----

export const listSubscribers = asyncHandler(async (_req: Request, res: Response) => {
  const items = await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } });
  sendSuccess(res, items);
});

export const deleteSubscriber = asyncHandler(async (req: Request, res: Response) => {
  await prisma.newsletterSubscriber.delete({ where: { id: req.params.id } });
  sendSuccess(res, { id: req.params.id }, 'Deleted');
});
