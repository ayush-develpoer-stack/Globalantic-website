import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { randomCode } from '../lib/crypto';
import { AfterCommit, notify } from './notification.service';
import { attendancePercent } from './learning.service';
import { verifyProgramCertificate } from './program.service';

/**
 * Certificate eligibility (all must hold):
 *  - enrollment COMPLETED, or the batch is COMPLETED / past its end date
 *  - attendance >= course.minAttendancePercent
 *  - every FINAL assessment of the batch passed (if the batch has any)
 *  - the fee is settled (a PAID payment, or nothing was payable)
 *  - enrollment not DROPPED / SUSPENDED
 * Only an admin with training.certificates.issue can issue; students can only read.
 */

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  attendancePercent: number | null;
  minAttendancePercent: number;
}

export async function certificateEligibility(enrollmentId: string): Promise<Eligibility> {
  const e = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { select: { minAttendancePercent: true } },
      batch: { select: { status: true, endDate: true } },
      attendance: { select: { status: true } },
      application: { select: { payablePaise: true, payments: { where: { status: 'PAID' }, select: { id: true } } } },
    },
  });
  if (!e) throw ApiError.notFound('Enrollment not found');
  const reasons: string[] = [];
  const pct = attendancePercent(e.attendance);

  if (e.status === 'DROPPED' || e.status === 'SUSPENDED') reasons.push(`Enrollment is ${e.status.toLowerCase()}`);
  const finished = e.status === 'COMPLETED' || e.batch.status === 'COMPLETED' || e.batch.endDate.getTime() < Date.now();
  if (!finished) reasons.push('The course has not been completed yet');
  if (pct === null || pct < e.course.minAttendancePercent) {
    reasons.push(`Attendance ${pct ?? 0}% is below the required ${e.course.minAttendancePercent}%`);
  }
  const finals = await prisma.assessment.findMany({ where: { batchId: e.batchId, type: 'FINAL' }, include: { results: { where: { enrollmentId } } } });
  for (const f of finals) {
    const r = f.results[0];
    if (!r) reasons.push(`No result recorded for ${f.title}`);
    else if (r.marks < f.passMarks) reasons.push(`${f.title} not passed`);
  }
  if (e.application.payablePaise > 0 && e.application.payments.length === 0) reasons.push('Course fee is not settled');

  return { eligible: reasons.length === 0, reasons, attendancePercent: pct, minAttendancePercent: e.course.minAttendancePercent };
}

export async function issueCertificate(actor: Actor, enrollmentId: string) {
  const elig = await certificateEligibility(enrollmentId);
  if (!elig.eligible) throw ApiError.conflict(`Not eligible: ${elig.reasons.join('; ')}`);
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { certificate: true, course: { select: { title: true } } } });
    if (e.certificate?.status === 'ISSUED') throw ApiError.conflict('A certificate has already been issued for this enrollment');
    if (e.certificate) throw ApiError.conflict('This certificate was revoked; re-issuing needs a manual review');
    const cert = await tx.certificate.create({
      data: {
        certificateNumber: await nextNumber(tx, 'CERT'),
        verificationCode: randomCode(12),
        enrollmentId,
        studentId: e.studentId,
        courseId: e.courseId,
        batchId: e.batchId,
        attendancePercent: elig.attendancePercent ?? 0,
        issuedById: actor.id,
      },
    });
    if (e.status !== 'COMPLETED') await tx.enrollment.update({ where: { id: enrollmentId }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await audit(tx, actor, { action: 'certificate.issued', entityType: 'Certificate', entityId: cert.id, after: { enrollmentId, number: cert.certificateNumber } });
    await notify(tx, e.studentId, { type: 'CERTIFICATE', title: 'Your certificate is ready', body: `Your certificate for ${e.course.title} has been issued.`, link: `${env.internPortalUrl}/certificates`, email: true }, after);
    return cert;
  });
  await after.flush();
  return result;
}

export async function revokeCertificate(actor: Actor, certificateId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.certificate.updateMany({ where: { id: certificateId, status: 'ISSUED' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason } });
    if (!res.count) throw ApiError.notFound('Issued certificate not found');
    await audit(tx, actor, { action: 'certificate.revoked', entityType: 'Certificate', entityId: certificateId, before: { status: 'ISSUED' }, after: { status: 'REVOKED' }, reason });
    return tx.certificate.findUniqueOrThrow({ where: { id: certificateId } });
  });
}

/** Public verification by code. Returns only what is printed on the certificate. */
export async function verifyCertificate(code: string) {
  const cert = await prisma.certificate.findUnique({
    where: { verificationCode: code.trim().toUpperCase() },
    include: { student: { select: { name: true } }, course: { select: { title: true } }, batch: { select: { name: true, startDate: true, endDate: true } } },
  });
  if (!cert) {
    // Certificate-program certificates share the public verification page.
    const program = await verifyProgramCertificate(code);
    return program ?? { valid: false as const };
  }
  return {
    type: 'course' as const,
    valid: cert.status === 'ISSUED',
    status: cert.status,
    certificateNumber: cert.certificateNumber,
    studentName: cert.student.name,
    course: cert.course.title,
    batch: cert.batch.name,
    period: { start: cert.batch.startDate, end: cert.batch.endDate },
    issuedAt: cert.issuedAt,
  };
}

export async function adminListCertificates(q: { skip: number; take: number }) {
  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      orderBy: { issuedAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: { student: { select: { id: true, name: true, email: true } }, course: { select: { title: true } }, batch: { select: { name: true } } },
    }),
    prisma.certificate.count(),
  ]);
  return { items, total };
}
