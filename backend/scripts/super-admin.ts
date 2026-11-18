/**
 * Grants or revokes Super Admin (the `admins.manage` permission) for an existing ADMIN account.
 *
 *   npm --workspace backend run super-admin -- list
 *   npm --workspace backend run super-admin -- grant owner@example.com
 *   npm --workspace backend run super-admin -- revoke someone@example.com
 *
 * Uses the DATABASE_URL in backend/.env (or the environment), so point it at the database
 * you mean to change. It only inserts/deletes one row in user_permission_grants and writes an
 * audit log entry; it never changes passwords, roles or other data. Super Admin can't be
 * granted through the API on purpose: someone with server access has to decide it.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SUPER_ADMIN_PERMISSION } from '../src/lib/permissions';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [cmd, rawEmail] = process.argv.slice(2);
  if (cmd === 'list') {
    const rows = await prisma.userPermissionGrant.findMany({
      where: { permission: SUPER_ADMIN_PERMISSION },
      select: { createdAt: true, user: { select: { email: true, name: true, role: true, status: true } } },
    });
    if (!rows.length) console.log('No Super Admin accounts.');
    for (const r of rows) {
      const note = r.user.role === 'ADMIN' ? '' : `  (inactive: role is ${r.user.role}, Super Admin only applies to ADMIN)`;
      console.log(`${r.user.email}  ${r.user.name}  ${r.user.status}  since ${r.createdAt.toISOString()}${note}`);
    }
    return;
  }
  if ((cmd !== 'grant' && cmd !== 'revoke') || !rawEmail) {
    console.error('Usage: super-admin list | grant <email> | revoke <email>');
    process.exitCode = 1;
    return;
  }
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true, deletedAt: true } });
  if (!user || user.deletedAt) throw new Error(`No account with email ${email}`);

  if (cmd === 'grant') {
    if (user.role !== 'ADMIN') throw new Error(`${email} has role ${user.role}; only ADMIN accounts can be Super Admin`);
    if (user.status !== 'ACTIVE') throw new Error(`${email} is ${user.status}; reactivate it first`);
    await prisma.$transaction([
      prisma.userPermissionGrant.upsert({
        where: { userId_permission: { userId: user.id, permission: SUPER_ADMIN_PERMISSION } },
        create: { userId: user.id, permission: SUPER_ADMIN_PERMISSION, grantedById: user.id },
        update: {},
      }),
      prisma.auditLog.create({
        data: { actorId: null, actorRole: 'SYSTEM', action: 'permission.granted', entityType: 'User', entityId: user.id, after: { permission: SUPER_ADMIN_PERMISSION }, reason: 'scripts/super-admin.ts' },
      }),
    ]);
    console.log(`✓ ${email} is now a Super Admin (takes effect on their next request).`);
  } else {
    const res = await prisma.userPermissionGrant.deleteMany({ where: { userId: user.id, permission: SUPER_ADMIN_PERMISSION } });
    if (!res.count) {
      console.log(`${email} was not a Super Admin; nothing changed.`);
      return;
    }
    await prisma.auditLog.create({
      data: { actorId: null, actorRole: 'SYSTEM', action: 'permission.revoked', entityType: 'User', entityId: user.id, before: { permission: SUPER_ADMIN_PERMISSION }, reason: 'scripts/super-admin.ts' },
    });
    console.log(`✓ Super Admin removed from ${email}.`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
