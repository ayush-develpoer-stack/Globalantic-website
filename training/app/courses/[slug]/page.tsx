import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { enumLabel } from '@globalantic/types';
import { Badge, Card, DescriptionList, EmptyState, ErrorState, formatINR } from '@globalantic/ui';
import { BatchCard } from '@/components/BatchCard';
import { Price } from '@/components/CourseCard';
import { ButtonLink } from '@/components/ButtonLink';
import { load } from '@/lib/server';
import { breadcrumbSchema, courseSchema, pageMeta } from '@/lib/seo';
import s from '@/styles/site.module.css';
import { jsonLd } from '@/lib/json-ld';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9-]{1,160}$/;

async function getCourse(slug: string) {
  if (!SLUG.test(slug)) return { data: null, error: null, status: 404 };
  return load((a) => a.catalog.course(slug));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const { data } = await getCourse(params.slug);
  if (!data) return { title: 'Course', robots: { index: false, follow: true } };
  return pageMeta({
    title: data.seoTitle || data.title,
    description: data.seoDescription || data.shortDescription,
    path: `/courses/${data.slug}`,
    image: data.bannerUrl,
  });
}

export default async function CourseDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const result = await getCourse(params.slug);
  if (result.status === 404) notFound();
  if (!result.data) {
    return (
      <div className={`container ${s.page}`}>
        <ErrorState title="This course could not be loaded" message={result.error} />
      </div>
    );
  }
  const c = result.data;
  const openBatch = c.batches.find((b) => b.admissionOpen);

  const crumbs = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Courses', path: '/courses' },
    { name: c.title, path: `/courses/${c.slug}` },
  ]);

  return (
    <div className={`container ${s.page}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(courseSchema(c)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />
      <nav className={s.breadcrumb} aria-label="Breadcrumb">
        <Link href="/courses">Courses</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{c.title}</span>
      </nav>
      <div className={s.detailGrid}>
        <div className={s.stack}>
          <div className={s.row}>
            <Badge tone="primary">{enumLabel(c.programType)}</Badge>
            <Badge>{enumLabel(c.mode)}</Badge>
            <Badge>{enumLabel(c.level)}</Badge>
            <Badge>{c.category}</Badge>
          </div>
          <h1>{c.title}</h1>
          <p className="lead">{c.shortDescription}</p>
          {c.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.bannerUrl} alt="" className={s.thumb} />
          )}
          <div className={s.prose}>
            <h2>About this course</h2>
            <p>{c.description}</p>
          </div>

          {c.skills.length > 0 && (
            <div className={s.prose}>
              <h2>Skills you will build</h2>
              <ul className={s.chips} style={{ listStyle: 'none', padding: 0 }}>
                {c.skills.map((sk) => (
                  <li key={sk} className={s.chip}>
                    {sk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={s.prose}>
            <h2>Syllabus</h2>
            {c.modules.length === 0 ? (
              <p>The detailed syllabus will be published soon.</p>
            ) : (
              <div className={s.stack} style={{ gap: 10 }}>
                {c.modules.map((m, i) => (
                  <details key={m.id} className={s.module} open={i === 0}>
                    <summary>
                      <span>
                        Module {i + 1}: {m.title}
                      </span>
                      {m.durationHours ? <span className={s.muted}>{m.durationHours} h</span> : null}
                    </summary>
                    <div className={s.moduleBody}>
                      {m.description && <p>{m.description}</p>}
                      {m.topics.length > 0 && (
                        <ul>
                          {m.topics.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          <div className={s.prose}>
            <h2>Eligibility</h2>
            <p>{c.eligibility}</p>
          </div>

          <div className={s.prose} id="batches">
            <h2>Batches</h2>
            {c.batches.length === 0 ? (
              <EmptyState title="No batches scheduled yet" description="New batches for this course will be listed here. Contact us to be notified." />
            ) : (
              <div className={s.stack}>
                {c.batches.map((b) => (
                  <BatchCard key={b.id} batch={b} />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className={s.aside} aria-label="Course summary">
          <Card title="Course fee">
            <div className={s.stack} style={{ gap: 10 }}>
              <Price fee={c.fee} />
              {c.fee.discountPaise > 0 && (
                <p className={s.muted}>
                  {c.discountLabel ? `${c.discountLabel}: ` : 'Discount: '}
                  {formatINR(c.fee.discountPaise)} off
                </p>
              )}
              <p className={s.muted}>Some batches may have their own fee; the exact amount is shown on each batch.</p>
              {openBatch ? (
                <ButtonLink href={`/apply?batch=${openBatch.id}`} full>
                  Apply for {openBatch.name}
                </ButtonLink>
              ) : (
                <p className={s.blocked}>No batch is open for admission right now.</p>
              )}
              <ButtonLink href="/fees" variant="ghost" size="sm">
                Fees &amp; payment information
              </ButtonLink>
            </div>
          </Card>
          <Card title="At a glance">
            <DescriptionList
              items={[
                { label: 'Duration', value: c.durationLabel },
                { label: 'Mode', value: enumLabel(c.mode) },
                { label: 'Level', value: enumLabel(c.level) },
                { label: 'Programme', value: enumLabel(c.programType) },
                { label: 'Attendance needed', value: `${c.minAttendancePercent}% for the certificate` },
              ]}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
