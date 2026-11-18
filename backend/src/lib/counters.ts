import type { Prisma } from '@prisma/client';

/**
 * Next human-readable document number, e.g. nextNumber(tx, 'APP') -> "APP-2026-000042".
 * The UPSERT row-locks the counter, so concurrent transactions are serialised
 * and numbers are never duplicated.
 */
export async function nextNumber(tx: Prisma.TransactionClient, prefix: string, date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "document_counters" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "document_counters"."value" + 1
    RETURNING "value"`;
  return `${key}-${String(rows[0].value).padStart(6, '0')}`;
}
