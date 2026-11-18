import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { sendError } from '../utils/apiResponse';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/** Thrown by the CORS origin check; mapped to 403 instead of a generic 500. */
export class CorsRejectedError extends Error {
  constructor() {
    super('Origin not allowed');
    this.name = 'CorsRejectedError';
  }
}

/**
 * Prisma error codes meaning "the database is unreachable / overloaded" — or a transaction that
 * timed out (P2028) or hit a write conflict/deadlock (P2034): retryable server-side failures,
 * not a fault in the client's request.
 */
const DB_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034']);
/** The schema in the database is older than the code (migrations not applied). */
const DB_SCHEMA_CODES = new Set(['P2021', 'P2022']);

/** body-parser / http-errors style errors carry `type` and `status`. */
function bodyParserError(err: unknown): { status: number; type?: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; statusCode?: unknown; type?: unknown; expose?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status === null || status < 400 || status >= 500 || e.expose !== true) return null;
  return { status, type: typeof e.type === 'string' ? e.type : undefined };
}

function logServerError(label: string, err: unknown): void {
  // Server-side log only (never sent to the client). Messages, not request bodies.
  console.error(`[error] ${label}:`, err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    sendError(res, 'Validation failed', 422, errors);
    return;
  }

  if (err instanceof CorsRejectedError) {
    sendError(res, 'Origin not allowed', 403);
    return;
  }

  // Malformed JSON, oversized bodies, unsupported encodings (express.json / urlencoded).
  const parserErr = bodyParserError(err);
  if (parserErr) {
    const message =
      parserErr.type === 'entity.parse.failed'
        ? 'Malformed JSON request body'
        : parserErr.type === 'entity.too.large'
          ? 'Request body is too large'
          : 'Invalid request body';
    sendError(res, message, parserErr.status);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 'A record with these details already exists', 409);
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 'Record not found', 404);
      return;
    }
    if (DB_UNAVAILABLE_CODES.has(err.code)) {
      logServerError(`database unavailable (${err.code})`, err);
      sendError(res, 'Service temporarily unavailable. Please try again shortly.', 503);
      return;
    }
    if (DB_SCHEMA_CODES.has(err.code)) {
      const meta = err.meta as { table?: unknown; column?: unknown } | undefined;
      const missing = meta?.column ?? meta?.table;
      logServerError(
        `database schema out of date (${err.code}${typeof missing === 'string' ? `, missing ${missing}` : ''}) — run prisma migrate deploy`,
        err,
      );
      sendError(res, 'Service temporarily unavailable. Please try again shortly.', 503);
      return;
    }
    sendError(res, 'Database request error', 400);
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logServerError('database unavailable', err);
    sendError(res, 'Service temporarily unavailable. Please try again shortly.', 503);
    return;
  }

  // A query Prisma refused to build (e.g. an unexpected array/object reached a filter).
  // Defence in depth: request validation should catch these first.
  if (err instanceof Prisma.PrismaClientValidationError) {
    logServerError('rejected database query', err);
    sendError(res, 'Invalid request parameters', 400);
    return;
  }

  // Unexpected error: log on the server, never echo internals to the client.
  if (env.isProd) logServerError('unhandled', err);
  else console.error(err);
  sendError(res, 'Something went wrong', 500);
}
