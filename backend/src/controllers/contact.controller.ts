import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { createEnquiry, trackEvent, type EnquiryInput } from '../services/crm.service';
import { privacyHash } from '../lib/crypto';

const THANKS = 'Thank you. Your enquiry has been received and our team will get back to you soon.';

/**
 * Public enquiry -> CRM lead (see services/crm.service.ts): spam checks, duplicate linking,
 * assignment, follow-up date, acknowledgement + team alerts. The lead is stored before any
 * email is attempted; an email failure never fails the request.
 */
export const submitContact = asyncHandler(async (req: Request, res: Response) => {
  const result = await createEnquiry(req.body as EnquiryInput, { ipHash: privacyHash(req.ip) });
  // Bots get the same answer as people, but nothing is stored.
  if (result.spam) sendSuccess(res, { reference: null }, THANKS, 201);
  else sendSuccess(res, { id: result.id, reference: result.reference }, THANKS, 201);
});

/** Anonymous CTA / WhatsApp click counter (no personal data). */
export const trackClick = asyncHandler(async (req: Request, res: Response) => {
  await trackEvent(req.body as { type: string });
  res.status(204).end();
});

// ---- Admin ----

export const listContacts = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const leads = await prisma.contactLead.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, leads);
});

export const updateContactStatus = asyncHandler(async (req: Request, res: Response) => {
  const lead = await prisma.contactLead.update({
    where: { id: req.params.id },
    data: { status: (req.body as { status: string }).status as never },
  });
  sendSuccess(res, lead, 'Status updated');
});

export const deleteContact = asyncHandler(async (req: Request, res: Response) => {
  await prisma.contactLead.delete({ where: { id: req.params.id } });
  sendSuccess(res, { id: req.params.id }, 'Deleted');
});
