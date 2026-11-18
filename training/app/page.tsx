import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Award, Briefcase, Check, GraduationCap, Laptop, MapPin, Gift } from 'lucide-react';
import { EmptyState, ErrorState, formatINR } from '@globalantic/ui';
import { CourseCard } from '@/components/CourseCard';
import { ButtonLink } from '@/components/ButtonLink';
import { Faq } from '@/components/Faq';
import { ADMISSION_STEPS } from '@/lib/content';
import { load } from '@/lib/server';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Globalantic Training — Software Development Courses & Internships',
  description: 'Trainer-led software development training and internships by Globalantic: online, offline and hybrid batches, assessments and a verifiable certificate.',
  path: '/',
  absolute: true,
});

export default async function HomePage() {
  const [courses, program] = await Promise.all([
    load((a) => a.catalog.courses({ pageSize: 6 })),
    load((a) => a.catalog.referralProgram()),
  ]);

  return (
    <>
      <section className={s.hero}>
        <div className={`container ${s.heroInner}`}>
          <div>
            <span className={s.eyebrow}>Globalantic Training</span>
            <h1 className={s.heroTitle}>Practical training and internships in software development</h1>
            <p className={s.heroLead}>
              Learn through structured, trainer-led batches — online or at our centre — with assignments, assessments and a verifiable
              certificate on completion.
            </p>
            <div className={s.row}>
              <ButtonLink href="/courses" size="lg">
                Explore courses
              </ButtonLink>
              <ButtonLink href="/batches" size="lg" variant="outline">
                See upcoming batches
              </ButtonLink>
            </div>
          </div>
          <div className={s.heroCard}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: 14 }}>How admission works</h2>
            <ol>
              {ADMISSION_STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className={s.stepNum} aria-hidden>
                    {i + 1}
                  </span>
                  <span>
                    <strong style={{ color: 'var(--foreground)' }}>{step.title}.</strong> {step.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className="container">
          <div className={s.sectionHead}>
            <span className={s.eyebrow}>Courses</span>
            <h2>Featured courses</h2>
            <p>Every course lists its syllabus, eligibility, fee and open batches.</p>
          </div>
          {courses.error ? (
            <ErrorState title="Courses could not be loaded" message={courses.error} />
          ) : !courses.data?.items.length ? (
            <EmptyState title="No courses are published yet" description="New courses will appear here as soon as they are announced. You can contact us to be notified." />
          ) : (
            <div className={s.grid3}>
              {courses.data.items.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}
          <div className={s.row} style={{ marginTop: 24 }}>
            <ButtonLink href="/courses" variant="outline">
              View all courses
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionMuted}`}>
        <div className="container">
          <div className={s.sectionHead}>
            <span className={s.eyebrow}>Programmes</span>
            <h2>Training, internship or certificate program</h2>
          </div>
          <div className={s.grid2}>
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <GraduationCap size={22} />
              </span>
              <h3>Training programmes</h3>
              <p>Structured courses that take you from fundamentals to building complete projects.</p>
              <ul className={s.list}>
                <li><Check size={16} aria-hidden /> Module-by-module syllabus</li>
                <li><Check size={16} aria-hidden /> Assignments with trainer feedback</li>
                <li><Check size={16} aria-hidden /> Certificate on successful completion</li>
              </ul>
              <div style={{ marginTop: 16 }}>
                <ButtonLink href="/programs/training" variant="outline" size="sm">
                  Browse training
                </ButtonLink>
              </div>
            </div>
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <Briefcase size={22} />
              </span>
              <h3>Internships</h3>
              <p>Work on guided, real-world style tasks under the supervision of a trainer.</p>
              <ul className={s.list}>
                <li><Check size={16} aria-hidden /> Team-style project work</li>
                <li><Check size={16} aria-hidden /> Regular reviews and feedback</li>
                <li><Check size={16} aria-hidden /> Internship completion certificate</li>
              </ul>
              <div style={{ marginTop: 16 }}>
                <ButtonLink href="/programs/internship" variant="outline" size="sm">
                  Browse internships
                </ButtonLink>
              </div>
            </div>
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <Award size={22} />
              </span>
              <h3>Certificate program</h3>
              <p>A self-paced program: complete the lessons, then pass the final assessment.</p>
              <ul className={s.list}>
                <li><Check size={16} aria-hidden /> Learn at your own pace online</li>
                <li><Check size={16} aria-hidden /> Final assessment scored instantly</li>
                <li><Check size={16} aria-hidden /> Certificate with a public verification code</li>
              </ul>
              <div style={{ marginTop: 16 }}>
                <ButtonLink href="/programs/certificate" variant="outline" size="sm">
                  View the certificate program
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className="container">
          <div className={s.sectionHead}>
            <span className={s.eyebrow}>Learning modes</span>
            <h2>Learn online or offline</h2>
          </div>
          <div className={s.grid2}>
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <Laptop size={22} />
              </span>
              <h3>Online batches</h3>
              <p>Live, scheduled classes you join from anywhere. Materials and assignments are in your student portal.</p>
            </div>
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <MapPin size={22} />
              </span>
              <h3>Offline &amp; hybrid batches</h3>
              <p>Classroom sessions at the venue shown on the batch page; hybrid batches combine both.</p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <ButtonLink href="/learning-modes" variant="ghost" size="sm">
              Compare learning modes →
            </ButtonLink>
          </div>
        </div>
      </section>

      {program.data?.enabled && (
        <section className={`${s.section} ${s.sectionMuted}`}>
          <div className="container">
            <div className={s.featureCard}>
              <span className={s.featureIcon} aria-hidden>
                <Gift size={22} />
              </span>
              <h3>Refer a friend</h3>
              <p>
                Enrolled students can earn {formatINR(program.data.rewardAmountPaise)} for each friend who joins through their referral link and completes
                a verified admission payment.
              </p>
              <div style={{ marginTop: 12 }}>
                <ButtonLink href="/referral" variant="outline" size="sm">
                  How referrals work
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={s.section}>
        <div className="container">
          <div className={s.sectionHead}>
            <span className={s.eyebrow}>FAQ</span>
            <h2>Frequently asked questions</h2>
          </div>
          <Faq limit={5} />
          <div style={{ marginTop: 16 }}>
            <ButtonLink href="/faq" variant="ghost" size="sm">
              All questions →
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="container">
        <div className={s.cta}>
          <div>
            <h2>Ready to start?</h2>
            <p>Create your account, choose a batch and apply in a few minutes.</p>
          </div>
          <div className={s.row}>
            <ButtonLink href="/register" size="lg">
              Register now
            </ButtonLink>
            <ButtonLink href="/contact" size="lg" variant="secondary">
              Ask a question
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
