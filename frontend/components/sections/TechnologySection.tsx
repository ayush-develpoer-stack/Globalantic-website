import { getTechnologies } from '@/lib/api';
import type { Technology } from '@/types';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { TechStack } from '@/components/tech/TechStack';
import styles from './TechnologySection.module.css';

/** Fallback (same list as prisma/data/reference.ts) when the technologies API returns nothing. */
const fallbackTechnologies: Technology[] = [
  { id: 'f1', name: 'React', category: 'Frontend', order: 1 },
  { id: 'f2', name: 'Next.js', category: 'Frontend', order: 2 },
  { id: 'f3', name: 'TypeScript', category: 'Frontend', order: 3 },
  { id: 'f4', name: 'JavaScript', category: 'Frontend', order: 4 },
  { id: 'f5', name: 'HTML', category: 'Frontend', order: 5 },
  { id: 'f6', name: 'CSS', category: 'Frontend', order: 6 },
  { id: 'f7', name: 'Node.js', category: 'Backend', order: 1 },
  { id: 'f8', name: 'Express.js', category: 'Backend', order: 2 },
  { id: 'f9', name: 'PHP', category: 'Backend', order: 3 },
  { id: 'f10', name: 'Laravel', category: 'Backend', order: 4 },
  { id: 'f11', name: 'PostgreSQL', category: 'Database', order: 1 },
  { id: 'f12', name: 'MySQL', category: 'Database', order: 2 },
  { id: 'f13', name: 'MongoDB', category: 'Database', order: 3 },
  { id: 'f14', name: 'React Native', category: 'Mobile', order: 1 },
  { id: 'f15', name: 'WordPress', category: 'CMS', order: 1 },
  { id: 'f16', name: 'Strapi', category: 'CMS', order: 2 },
  { id: 'f17', name: 'Vercel', category: 'Cloud', order: 1 },
  { id: 'f18', name: 'Render', category: 'Cloud', order: 2 },
  { id: 'f19', name: 'Supabase', category: 'Cloud', order: 3 },
  { id: 'f20', name: 'Cloudinary', category: 'Cloud', order: 4 },
  { id: 'f21', name: 'OpenAI', category: 'AI', order: 1 },
  { id: 'f22', name: 'Gemini', category: 'AI', order: 2 },
  { id: 'f23', name: 'OpenRouter', category: 'AI', order: 3 },
];

function groupByCategory(techs: Technology[]): [string, Technology[]][] {
  const groups = new Map<string, Technology[]>();
  for (const tech of techs) {
    const list = groups.get(tech.category) ?? [];
    list.push(tech);
    groups.set(tech.category, list);
  }
  return Array.from(groups.entries()).map(
    ([category, list]): [string, Technology[]] => [
      category,
      [...list].sort((a, b) => a.order - b.order),
    ],
  );
}

/** Technology stack, grouped by category and rendered with technology logos. */
export async function TechnologySection() {
  const techs = (await getTechnologies()) ?? [];
  const source = techs.length ? techs : fallbackTechnologies;
  const grouped = groupByCategory(source);

  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Technology"
          title="The technology we build with"
          description="A modern, proven toolkit across the stack — selected to fit each project rather than a one-size-fits-all approach."
        />

        <div className={styles.groups}>
          {grouped.map(([category, list]) => (
            <div key={category} className={styles.group}>
              <h3 className={styles.category}>{category}</h3>
              <TechStack items={list.map((t) => t.name)} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
