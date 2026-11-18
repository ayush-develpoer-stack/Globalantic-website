import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, prisma } from './config/database';
import { getSchemaStatus } from './config/schemaStatus';
import { endAllStreams } from './routes/notifications.routes';

/** Optional integrations: the API runs without them, but the named feature is off. Names only, never values. */
function warnUnconfigured(): void {
  if (!env.isProd) return;
  const off: string[] = [];
  if (!env.uploadDir) off.push('UPLOAD_DIR (file uploads return 503)');
  if (!env.resendApiKey) off.push('RESEND_API_KEY (emails are logged as SKIPPED)');
  if (!env.razorpay.keyId || !env.razorpay.keySecret || !env.razorpay.webhookSecret) off.push('RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET (online payments disabled)');
  if (!env.cronSecret) off.push('CRON_SECRET (reminder and notification dispatch endpoints disabled)');
  if (!env.cookieDomain) off.push('COOKIE_DOMAIN (sign-in is not shared across portal subdomains)');
  // eslint-disable-next-line no-console
  for (const o of off) console.warn(`! Not configured: ${o}`);
}

async function bootstrap(): Promise<void> {
  const app = createApp();
  warnUnconfigured();

  try {
    await connectDatabase();
    // eslint-disable-next-line no-console
    console.log('✓ Database connected');
    const schema = await getSchemaStatus(prisma);
    if (schema.state === 'behind') {
      // eslint-disable-next-line no-console
      console.error(
        `✗ Database schema is out of date — ${schema.pending.length} migration(s) not applied: ${schema.pending.join(', ')}.\n` +
          '  Routes using the new tables/columns will return 503 until `npm run prisma:deploy` runs.',
      );
    } else if (schema.state === 'unknown') {
      // eslint-disable-next-line no-console
      console.warn('! Could not find prisma/migrations; schema version not checked (set MIGRATIONS_DIR)');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✗ Database connection failed:', err);
  }

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`✓ Globalantic API running on http://localhost:${env.port} [${env.nodeEnv}]`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Long-lived SSE streams and idle keep-alive sockets would hold close() open indefinitely.
    endAllStreams();
    server.closeIdleConnections();
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('! Requests still open after 10 s — closing them');
      server.closeAllConnections();
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
