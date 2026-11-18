import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FilePurpose, Prisma, StoredFile } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hasPermission, type Permission } from '../lib/permissions';
import { audit, type Actor } from '../lib/audit';
import { sha256 } from '../lib/crypto';

/**
 * Private file storage.
 *
 * - Bytes are written to UPLOAD_DIR (outside any web root) under a random
 *   server-generated key. The client's file name is kept only as display text.
 * - The type is detected from magic bytes; the extension and the client's
 *   Content-Type are ignored. Only PDF / PNG / JPEG / WEBP are accepted, so
 *   executables, HTML and SVG (script-capable) can never be stored.
 * - Files are never served statically: GET /api/files/:id re-checks ownership
 *   (or a role/assignment relationship) on every download.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const ALLOWED_UPLOAD_TYPES = SIGNATURES.map((s) => s.mime);

/** Detects the real type from content. Returns null for anything not on the allow-list. */
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(buf));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/** Display-only name: no path parts, control characters or reserved characters; bounded length. */
export function safeDisplayName(raw: string | undefined, ext: string): string {
  let name = '';
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = raw ?? '';
  }
  name = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '').slice(0, 100) || 'file';
  return `${base}.${ext}`;
}

const can = (actor: Actor, p: Permission) => hasPermission(actor.role, p, actor.permissions ?? []);

function storageRoot(): string {
  if (!env.uploadDir) throw new ApiError(503, 'File uploads are not configured yet.');
  return path.resolve(env.uploadDir);
}

function pathForKey(key: string): string {
  if (!/^[a-f0-9]{32}$/.test(key)) throw ApiError.notFound('File not found');
  return path.join(storageRoot(), key.slice(0, 2), key);
}

/** Which roles may upload for which purpose. */
function assertCanUpload(actor: Actor, purpose: FilePurpose) {
  const allowed =
    purpose === 'ASSIGNMENT_SUBMISSION' || purpose === 'ADMISSION_DOCUMENT'
      ? actor.role === 'STUDENT'
      : purpose === 'EMPLOYEE_DOCUMENT'
        ? can(actor, 'employees.manage')
        : purpose === 'COURSE_IMAGE'
          ? can(actor, 'training.courses.manage')
          : purpose === 'CMS_IMAGE'
            ? can(actor, 'cms.manage')
            : purpose === 'LEARNING_MATERIAL'
              ? actor.role === 'TRAINER'
              : purpose === 'SIGNED_DOCUMENT'
                ? can(actor, 'documents.manage') || can(actor, 'documents.finance')
                : false;
  if (!allowed) throw ApiError.forbidden('You cannot upload files for this purpose');
}

export async function storeUpload(actor: Actor, purpose: FilePurpose, body: Buffer, rawName: string | undefined) {
  assertCanUpload(actor, purpose);
  if (!body.length) throw ApiError.validation([{ field: 'file', message: 'The file is empty' }]);
  if (body.length > env.uploadMaxBytes) throw new ApiError(413, 'File is too large');
  const type = detectFileType(body);
  if (!type) {
    throw ApiError.validation([{ field: 'file', message: 'Only PDF, PNG, JPEG or WEBP files are allowed' }]);
  }
  if (PUBLIC_PURPOSES.includes(purpose) && !type.mime.startsWith('image/')) {
    throw ApiError.validation([{ field: 'file', message: 'Only PNG, JPEG or WEBP images are allowed here' }]);
  }
  const key = crypto.randomBytes(16).toString('hex');
  const target = pathForKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, { flag: 'wx', mode: 0o600 });
  try {
    const file = await prisma.storedFile.create({
      data: {
        ownerId: actor.id,
        purpose,
        storageKey: key,
        originalName: safeDisplayName(rawName, type.ext),
        mimeType: type.mime,
        sizeBytes: body.length,
        sha256: sha256(body),
      },
    });
    await audit(prisma, actor, { action: 'file.uploaded', entityType: 'StoredFile', entityId: file.id, after: { purpose, sizeBytes: file.sizeBytes, mimeType: file.mimeType } });
    return publicFile(file);
  } catch (err) {
    await fs.rm(target, { force: true });
    throw err;
  }
}

/** Uploads are configured (UPLOAD_DIR). Generated PDFs are cached only when they are. */
export const storageConfigured = () => Boolean(env.uploadDir);

/**
 * Stores a server-generated PDF (receipt, certificate, business document) privately.
 * Not reachable through the generic download route except by its owner; domain endpoints
 * (documents, receipts, certificates) apply their own access rules and serve it.
 */
export async function storeGenerated(db: Db, ownerId: string, pdf: Buffer, name: string) {
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Generated file is not a PDF');
  const key = crypto.randomBytes(16).toString('hex');
  const target = pathForKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, pdf, { flag: 'wx', mode: 0o600 });
  try {
    return await db.storedFile.create({
      data: { ownerId, purpose: 'GENERATED_DOCUMENT', storageKey: key, originalName: safeDisplayName(name, 'pdf'), mimeType: 'application/pdf', sizeBytes: pdf.length, sha256: sha256(pdf) },
    });
  } catch (err) {
    await fs.rm(target, { force: true });
    throw err;
  }
}

/** Reads a stored file's bytes for a domain endpoint that already checked access. */
export async function readStored(fileId: string): Promise<{ file: StoredFile; data: Buffer } | null> {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt || !env.uploadDir) return null;
  try {
    return { file, data: await fs.readFile(pathForKey(file.storageKey)) };
  } catch {
    return null;
  }
}

/** Images that are intentionally public (course thumbnails/banners, CMS images). */
export const PUBLIC_PURPOSES: FilePurpose[] = ['COURSE_IMAGE', 'CMS_IMAGE'];

/** Absolute public URL for a public image (stored in course/CMS image fields). */
export function publicImageUrl(id: string): string {
  return env.publicApiUrl + '/files/public/' + id;
}

export function publicFile(f: Pick<StoredFile, 'id' | 'originalName' | 'mimeType' | 'sizeBytes' | 'createdAt'> & { purpose?: FilePurpose }) {
  return {
    id: f.id,
    name: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt,
    ...(f.purpose && PUBLIC_PURPOSES.includes(f.purpose) ? { url: publicImageUrl(f.id) } : {}),
  };
}

/** Public read of a public image. Private purposes are never returned here (404). */
export async function openPublicImage(fileId: string) {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt || !PUBLIC_PURPOSES.includes(file.purpose) || !file.mimeType.startsWith('image/')) throw ApiError.notFound('File not found');
  try {
    return { file, data: await fs.readFile(pathForKey(file.storageKey)) };
  } catch {
    throw ApiError.notFound('File not found');
  }
}

/**
 * Validates that `fileId` can be attached by `actorId` for `purpose`: the actor
 * uploaded it, it has the right purpose, and it is not attached elsewhere.
 */
export async function assertAttachable(db: Db, actorId: string, fileId: string, purpose: FilePurpose, current?: { submissionId?: string; applicationId?: string }) {
  const f = await db.storedFile.findUnique({
    where: { id: fileId },
    include: { submissions: { select: { id: true } }, applications: { select: { id: true } }, employeeDocuments: { select: { id: true } }, learningMaterials: { select: { id: true } }, documentSignedCopies: { select: { id: true } } },
  });
  if (!f || f.deletedAt || f.ownerId !== actorId || f.purpose !== purpose) {
    throw ApiError.validation([{ field: 'fileId', message: 'Upload the file again and retry' }]);
  }
  const usedElsewhere =
    f.submissions.some((s) => s.id !== current?.submissionId) ||
    f.applications.some((a) => a.id !== current?.applicationId) ||
    f.employeeDocuments.length > 0 ||
    f.learningMaterials.length > 0 ||
    f.documentSignedCopies.length > 0;
  if (usedElsewhere) throw ApiError.validation([{ field: 'fileId', message: 'This file is already attached elsewhere' }]);
  return f;
}

/** Ownership / relationship check for downloads. Anything not allowed is reported as 404. */
async function canRead(actor: Actor, file: StoredFile): Promise<boolean> {
  if (file.ownerId === actor.id) return true;
  if (file.purpose === 'ASSIGNMENT_SUBMISSION') {
    if (can(actor, 'training.learning.read')) return true;
    const sub = await prisma.assignmentSubmission.findFirst({ where: { fileId: file.id }, select: { studentId: true, assignment: { select: { batchId: true } } } });
    if (!sub) return false;
    if (sub.studentId === actor.id) return true;
    if (actor.role === 'TRAINER') {
      return Boolean(await prisma.trainerAssignment.findFirst({ where: { trainerId: actor.id, batchId: sub.assignment.batchId, removedAt: null } }));
    }
    return false;
  }
  if (file.purpose === 'ADMISSION_DOCUMENT') {
    return can(actor, 'training.admissions.read') && Boolean(await prisma.admissionApplication.findFirst({ where: { documentFileId: file.id } }));
  }
  if (file.purpose === 'LEARNING_MATERIAL') {
    // Staff with learning access, the batch's trainers, and students enrolled in the batch.
    const m = await prisma.learningMaterial.findFirst({ where: { fileId: file.id, deletedAt: null }, select: { batchId: true } });
    if (!m) return false;
    if (can(actor, 'training.learning.read')) return true;
    if (actor.role === 'TRAINER') {
      return Boolean(await prisma.trainerAssignment.findFirst({ where: { trainerId: actor.id, batchId: m.batchId, removedAt: null } }));
    }
    if (actor.role === 'STUDENT') {
      return Boolean(await prisma.enrollment.findFirst({ where: { studentId: actor.id, batchId: m.batchId, status: { in: ['ACTIVE', 'COMPLETED'] } } }));
    }
    return false;
  }
  if (file.purpose === 'EMPLOYEE_DOCUMENT') {
    if (can(actor, 'employees.read')) return true;
    return Boolean(await prisma.employeeDocument.findFirst({ where: { fileId: file.id, employeeId: actor.id, visibleToEmployee: true, deletedAt: null } }));
  }
  return false;
}

export async function openForDownload(actor: Actor, fileId: string) {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt || !(await canRead(actor, file))) throw ApiError.notFound('File not found');
  let data: Buffer;
  try {
    data = await fs.readFile(pathForKey(file.storageKey));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.notFound('File not found');
  }
  return { file, data };
}
