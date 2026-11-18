import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { actorOf } from '../middleware/auth.middleware';
import { audit } from '../lib/audit';

/** Returns the single settings row, creating a default one if none exists. */
async function getOrCreateSettings() {
  const existing = await prisma.siteSetting.findFirst();
  if (existing) return existing;
  return prisma.siteSetting.create({ data: {} });
}

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  sendSuccess(res, settings);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const current = await getOrCreateSettings();
  const data = { ...(req.body as Record<string, unknown>) };
  if (data.secondaryEmail === '') data.secondaryEmail = null;
  const settings = await prisma.siteSetting.update({ where: { id: current.id }, data });
  // Audit what changed (public company details: contact email/phone/WhatsApp etc.).
  const changed = Object.keys(data).filter((k) => JSON.stringify((current as Record<string, unknown>)[k] ?? null) !== JSON.stringify((settings as Record<string, unknown>)[k] ?? null));
  if (changed.length) {
    const pick = (o: Record<string, unknown>) => Object.fromEntries(changed.map((k) => [k, o[k] ?? null]));
    await audit(prisma, actorOf(req), { action: 'settings.updated', entityType: 'SiteSetting', entityId: current.id, before: pick(current as Record<string, unknown>) as never, after: pick(settings as Record<string, unknown>) as never });
  }
  sendSuccess(res, settings, 'Settings updated');
});
