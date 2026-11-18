import type { Response } from 'express';

/** Streams a generated PDF privately: never cached by browsers or proxies. */
export function sendPdf(res: Response, file: { pdf: Buffer; filename: string }, disposition: 'inline' | 'attachment' = 'attachment') {
  const safe = file.filename.replace(/[^A-Za-z0-9._-]+/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safe}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(file.pdf.length));
  res.end(file.pdf);
}
