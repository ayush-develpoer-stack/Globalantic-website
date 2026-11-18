/**
 * Temporary administrator accounts that switch themselves off.
 *
 *   $env:TEMP_ADMIN_PASSWORD = "<password>"
 *   npm --workspace backend run temp-admin -- grant someone@example.com --hours 48 --name "Some One"
 *   npm --workspace backend run temp-admin -- list
 *   npm --workspace backend run temp-admin -- revoke someone@example.com
 *
 * grant   creates the ADMIN account (or re-activates/extends an existing temporary one) with an
 *         expiry of 1-72 hours. The password is read from TEMP_ADMIN_PASSWORD, must meet the
 *         normal password policy and is stored only as a bcrypt hash. It is optional when
 *         extending an existing temporary account.
 * revoke  ends access now: suspends the account and signs it out everywhere.
 *
 * After the expiry the API suspends the account on its next login or request (see
 * src/lib/access-expiry.ts). Permanent accounts are never touched by this script.
 * Uses DATABASE_URL from backend/.env (or the environment).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';
import { password as passwordPolicy } from '../src/validators/training';
import { EXPIRY_PREFIX, accessExpiresAt, expiryMarker } from '../src/lib/access-expiry';

const prisma = new PrismaClient();
const MAX_HOURS = 72;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function audit(userId: string, action: string, after: object) {
  await prisma.auditLog.create({ data: { actorId: null, actorRole: 'SYSTEM', action, entityType: 'User', entityId: userId, after, reason: 'scripts/temp-admin.ts' } });
}

async function setExpiry(userId: string, at: Date) {
  await prisma.$transaction([
    prisma.userPermissionGrant.deleteMany({ where: { userId, permission: { startsWith: EXPIRY_PREFIX } } }),
    prisma.userPermissionGrant.create({ data: { userId, permission: expiryMarker(at), grantedById: userId } }),
  ]);
}

async function grant(email: string, args: string[]) {
  const hours = Number(option(args, 'hours') ?? 48);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) throw new Error(`--hours must be between 1 and ${MAX_HOURS}`);
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  const raw = process.env.TEMP_ADMIN_PASSWORD;
  if (raw !== undefined) {
    const check = passwordPolicy.safeParse(raw);
    if (!check.success) throw new Error(`TEMP_ADMIN_PASSWORD does not meet the password policy: ${check.error.issues.map((i) => i.message).join('; ')}`);
  }

  const existing = await prisma.user.findUnique({ where: { email }, include: { permissionGrants: { select: { permission: true } } } });
  if (existing) {
    if (!accessExpiresAt(existing.permissionGrants.map((g) => g.permission))) {
      throw new Error(`${email} is an existing permanent ${existing.role} account; this script only manages temporary accounts`);
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null, ...(raw ? { passwordHash: await hashPassword(raw) } : {}) },
    });
    await setExpiry(existing.id, expiresAt);
    await audit(existing.id, 'user.temp_admin_extended', { expiresAt, passwordChanged: Boolean(raw) });
    console.log(`✓ ${email}: temporary ADMIN access extended until ${expiresAt.toISOString()}${raw ? ' (password updated)' : ''}`);
    return;
  }

  if (!raw) throw new Error('Set TEMP_ADMIN_PASSWORD to create a new account');
  const name = option(args, 'name') ?? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const user = await prisma.user.create({
    data: { email, name, role: 'ADMIN', status: 'ACTIVE', passwordHash: await hashPassword(raw), emailVerifiedAt: new Date() },
  });
  await setExpiry(user.id, expiresAt);
  await audit(user.id, 'user.temp_admin_created', { role: 'ADMIN', expiresAt });
  console.log(`✓ ${email}: temporary ADMIN account created, access until ${expiresAt.toISOString()}`);
}

async function revoke(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { permissionGrants: { select: { permission: true } } } });
  if (!user) throw new Error(`No account with email ${email}`);
  if (!accessExpiresAt(user.permissionGrants.map((g) => g.permission))) throw new Error(`${email} is not a temporary account`);
  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
  await setExpiry(user.id, now);
  await audit(user.id, 'user.temp_admin_revoked', { revokedAt: now });
  console.log(`✓ ${email}: access revoked (suspended, all sessions ended)`);
}

async function list() {
  const rows = await prisma.userPermissionGrant.findMany({
    where: { permission: { startsWith: EXPIRY_PREFIX } },
    select: { permission: true, user: { select: { email: true, role: true, status: true } } },
  });
  if (!rows.length) console.log('No temporary accounts.');
  for (const r of rows) {
    const at = accessExpiresAt([r.permission])!;
    const state = at.getTime() <= Date.now() ? 'EXPIRED' : `expires in ${Math.round((at.getTime() - Date.now()) / 3_600_000)} h`;
    console.log(`${r.user.email}  ${r.user.role}  ${r.user.status}  until ${at.toISOString()}  (${state})`);
  }
}

async function main() {
  const [cmd, rawEmail, ...rest] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (cmd === 'list') return list();
  if (cmd === 'grant' && email) return grant(email, rest);
  if (cmd === 'revoke' && email) return revoke(email);
  console.error('Usage: temp-admin list | grant <email> [--hours 48] [--name "Full Name"] | revoke <email>');
  process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
