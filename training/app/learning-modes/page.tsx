import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Laptop, MapPin, Shuffle } from 'lucide-react';
import { PageHeader } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import s from '@/styles/site.module.css';

export const metadata: Metadata = pageMeta({
  title: 'Online & offline learning',
  description: 'How online, offline and hybrid batches work at Globalantic Training.',
  path: '/learning-modes',
});

const MODES = [
  {
    icon: Laptop,
    title: 'Online',
    points: [
      'Live classes at the scheduled batch timings',
      'Join from anywhere with a laptop and a stable internet connection',
      'Materials, assignments and announcements in the student portal',
      'Attendance is recorded for each live session',
    ],
  },
  {
    icon: MapPin,
    title: 'Offline',
    points: [
      'Classroom sessions at the venue shown on the batch page',
      'Hands-on practice with the trainer in the room',
      'The same student portal for materials, assignments and results',
      'Attendance is recorded for each session',
    ],
  },
  {
    icon: Shuffle,
    title: 'Hybrid',
    points: [
      'A mix of classroom and online sessions as published in the batch schedule',
      'Check the weekly timetable in the portal for the location of each class',
    ],
  },
];

export default function LearningModesPage() {
  return (
    <div className={`container ${s.page}`}>
      <PageHeader eyebrow="Learning modes" title="Online, offline and hybrid batches" description="Every batch states its mode, schedule and (for classroom batches) venue before you apply." />
      <div className={s.grid3}>
        {MODES.map((m) => (
          <div key={m.title} className={s.featureCard}>
            <span className={s.featureIcon} aria-hidden>
              <m.icon size={22} />
            </span>
            <h2 style={{ fontSize: '1.2rem', margin: '10px 0 4px' }}>{m.title}</h2>
            <ul className={s.list}>
              {m.points.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={s.section}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 8 }}>Course duration and syllabus</h2>
        <p>Each course page lists its duration, a module-by-module syllabus and the attendance needed for the certificate.</p>
        <div className={s.row} style={{ marginTop: 16 }}>
          <ButtonLink href="/batches?mode=ONLINE" variant="outline">
            Online batches
          </ButtonLink>
          <ButtonLink href="/batches?mode=OFFLINE" variant="outline">
            Offline batches
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
