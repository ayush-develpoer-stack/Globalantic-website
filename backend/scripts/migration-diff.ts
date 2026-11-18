/**
 * Generates the SQL needed to bring the committed migrations up to the current
 * schema.prisma, using a local shadow database. Prints SQL to stdout; it
 * does NOT apply anything anywhere.
 *
 *   npm --workspace backend run db:diff > ../prisma/migrations/<ts>_<name>/migration.sql
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { startLocalPg } from './embedded-pg';

async function main() {
  const pg = await startLocalPg({ port: 54331, persistent: false });
  try {
    await pg.createDatabase('shadow');
    const sql = execSync(
      'npx prisma migrate diff --from-migrations ../prisma/migrations --to-schema-datamodel ../prisma/schema.prisma ' +
        `--shadow-database-url "${pg.url('shadow')}" --script`,
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' } },
    );
    process.stdout.write(sql);
  } finally {
    await pg.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
