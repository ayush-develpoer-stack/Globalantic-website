/**
 * LOCAL DEVELOPMENT DEMO DATA ONLY.
 *
 * Every record is labelled [DEMO] and uses example.test emails. This is not
 * business data: it exists so the portals can be exercised locally. The script
 * refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
 *
 *   npm --workspace backend run dev:db -- --seed
 */
import { PrismaClient } from '@prisma/client';
// Resolved from backend/ (bcryptjs is a backend dependency).
import { hashPassword } from '../backend/src/utils/password';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url) || process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data: DATABASE_URL is not a local database.');
  process.exit(1);
}

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'DemoPass123';
const day = 86_400_000;

async function user(email: string, name: string, role: 'ADMIN' | 'FINANCE' | 'TRAINER' | 'STUDENT', phone?: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role,
      phone: phone ?? null,
      passwordHash,
      emailVerifiedAt: new Date(),
      ...(role === 'STUDENT' ? { studentProfile: { create: { emailCanonical: email, consentAt: new Date(), consentVersion: 'demo', city: 'Bhopal' } } } : {}),
    },
  });
}

async function main() {
  const admin = await user('admin@example.test', '[DEMO] Admin', 'ADMIN');
  await user('finance@example.test', '[DEMO] Finance', 'FINANCE');
  const trainer = await user('trainer@example.test', '[DEMO] Trainer', 'TRAINER');
  const student = await user('student@example.test', '[DEMO] Student One', 'STUDENT', '919000000001');
  await user('student2@example.test', '[DEMO] Student Two', 'STUDENT', '919000000002');

  const course = await prisma.course.upsert({
    where: { slug: 'demo-full-stack-web-development' },
    update: {},
    create: {
      slug: 'demo-full-stack-web-development',
      title: '[DEMO] Full Stack Web Development',
      shortDescription: 'Demo course for local development. Replace with real course content in the admin app.',
      description: 'This is placeholder content used only on a local development database.',
      category: 'Web Development',
      programType: 'TRAINING',
      durationLabel: '12 weeks',
      durationWeeks: 12,
      mode: 'HYBRID',
      level: 'BEGINNER',
      skills: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js'],
      eligibility: 'Demo eligibility text.',
      feePaise: 100_000,
      status: 'PUBLISHED',
      modules: {
        create: [
          { title: 'Web foundations', topics: ['HTML', 'CSS'], order: 0 },
          { title: 'JavaScript', topics: ['Language basics', 'DOM'], order: 1 },
          { title: 'React & Node', topics: ['Components', 'APIs'], order: 2 },
        ],
      },
    },
  });
  await prisma.course.upsert({
    where: { slug: 'demo-internship' },
    update: {},
    create: {
      slug: 'demo-internship',
      title: '[DEMO] Internship Programme',
      shortDescription: 'Demo internship for local development.',
      description: 'Placeholder internship used only on a local development database.',
      category: 'Internship',
      programType: 'INTERNSHIP',
      durationLabel: '8 weeks',
      mode: 'OFFLINE',
      eligibility: 'Demo eligibility text.',
      feePaise: 0,
      status: 'PUBLISHED',
      modules: { create: [{ title: 'Project work', topics: ['Team project'], order: 0 }] },
    },
  });

  const now = Date.now();
  const batch = await prisma.batch.upsert({
    where: { courseId_name: { courseId: course.id, name: '[DEMO] Morning batch' } },
    update: {},
    create: {
      courseId: course.id,
      name: '[DEMO] Morning batch',
      startDate: new Date(now - 7 * day),
      endDate: new Date(now + 80 * day),
      registrationDeadline: new Date(now + 20 * day),
      mode: 'HYBRID',
      venue: 'Demo venue',
      capacity: 25,
      status: 'OPEN',
      schedules: { create: [1, 3, 5].map((d) => ({ dayOfWeek: d, startTime: '10:00', endTime: '12:00', topic: 'Class' })) },
    },
  });
  await prisma.trainerAssignment.upsert({ where: { batchId_trainerId: { batchId: batch.id, trainerId: trainer.id } }, update: {}, create: { batchId: batch.id, trainerId: trainer.id } });

  // Student One: enrolled via a recorded (offline) demo payment
  const existing = await prisma.admissionApplication.findUnique({ where: { studentId_batchId: { studentId: student.id, batchId: batch.id } } });
  if (!existing) {
    const app = await prisma.admissionApplication.create({
      data: { applicationNumber: 'APP-DEMO-000001', studentId: student.id, courseId: course.id, batchId: batch.id, status: 'ENROLLED', feePaise: 100_000, payablePaise: 100_000, qualification: 'Demo qualification' },
    });
    const payment = await prisma.payment.create({
      data: { studentId: student.id, applicationId: app.id, provider: 'OFFLINE', amountPaise: 100_000, status: 'PAID', verifiedAt: new Date(), verifiedVia: 'OFFLINE_RECORD', offlineReference: 'DEMO', recordedById: admin.id },
    });
    await prisma.invoice.create({ data: { invoiceNumber: 'INV-DEMO-000001', studentId: student.id, applicationId: app.id, paymentId: payment.id, amountPaise: 100_000, lineItems: [{ description: '[DEMO] course fee', amountPaise: 100_000 }] } });
    const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, courseId: course.id, batchId: batch.id, applicationId: app.id } });
    await prisma.assignment.create({ data: { batchId: batch.id, title: '[DEMO] First assignment', description: 'Demo assignment.', dueAt: new Date(now + 5 * day), maxMarks: 10, createdById: trainer.id } });
    await prisma.attendance.create({ data: { batchId: batch.id, enrollmentId: enrollment.id, studentId: student.id, sessionDate: new Date(new Date(now - day).toISOString().slice(0, 10)), status: 'PRESENT', markedById: trainer.id } });
    await prisma.announcement.create({ data: { batchId: batch.id, title: '[DEMO] Welcome', body: 'Demo announcement.', createdById: trainer.id } });
  }
  await prisma.referralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // [DEMO] certificate program (separate module) so the registration -> payment -> lessons ->
  // assessment -> certificate flow can be exercised locally. Not real program content.
  const demoProgram = await prisma.certificateProgram.upsert({
    where: { slug: 'demo-certificate-program' },
    update: {},
    create: {
      slug: 'demo-certificate-program',
      title: '[DEMO] Certificate Program',
      summary: '[DEMO] Self-paced program used to test registration, payment and certificates locally.',
      description: '[DEMO] This program exists only in local development. Complete both lessons, then pass the final assessment.',
      feePaise: 99_900,
      status: 'PUBLISHED',
      passPercent: 60,
      maxAttempts: 2,
      timeLimitMinutes: 15,
    },
  });
  if (!(await prisma.programLesson.count({ where: { programId: demoProgram.id } }))) {
    await prisma.programLesson.createMany({
      data: [
        { programId: demoProgram.id, position: 1, title: '[DEMO] Lesson one', body: '[DEMO] Lesson one text.\n\nA second paragraph.', minMinutes: 0, required: true },
        { programId: demoProgram.id, position: 2, title: '[DEMO] Lesson two', body: '[DEMO] Lesson two text.', minMinutes: 1, required: true },
      ],
    });
    await prisma.programQuestion.createMany({
      data: [
        { programId: demoProgram.id, prompt: '[DEMO] Pick option A', options: ['A', 'B', 'C'], correctIndex: 0 },
        { programId: demoProgram.id, prompt: '[DEMO] Pick option B', options: ['A', 'B', 'C'], correctIndex: 1 },
        { programId: demoProgram.id, prompt: '[DEMO] Pick option C', options: ['A', 'B', 'C'], correctIndex: 2 },
      ],
    });
  }

  console.log('✓ [DEMO] data ready (local only). Password for all demo accounts:', DEMO_PASSWORD);
  console.log('  admin@example.test, finance@example.test, trainer@example.test, student@example.test, student2@example.test');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
