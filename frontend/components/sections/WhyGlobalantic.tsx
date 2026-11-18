import { Icon } from '@/components/ui/Icon';
import { SectionHeading } from '@/components/ui/SectionHeading';
import styles from './WhyGlobalantic.module.css';

const reasons = [
  {
    icon: 'Code2',
    title: 'Full-stack expertise',
    description: 'One team across design, frontend, backend, mobile and cloud — no gaps, no hand-offs.',
  },
  {
    icon: 'Sparkles',
    title: 'Modern stack',
    description: 'We work with current, well-supported technologies chosen to fit your product and team.',
  },
  {
    icon: 'CalendarCheck',
    title: 'Transparent process',
    description: 'Clear scope, regular updates and honest communication at every stage of the build.',
  },
  {
    icon: 'Briefcase',
    title: 'Ownership of code',
    description: 'The code and assets we build are yours — documented and handed over, with no lock-in.',
  },
  {
    icon: 'Wrench',
    title: 'Ongoing support',
    description: 'We stay available after launch to maintain, improve and scale what we have built.',
  },
  {
    icon: 'TrendingUp',
    title: 'Business-focused',
    description: 'We measure success by the impact on your business, not just the software we ship.',
  },
];

/** Honest, static reasons to work with Globalantic. */
export function WhyGlobalantic() {
  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Why Globalantic"
          title="A partner you can build with, long-term"
          description="What you can rely on when you choose us to design and build your product."
        />

        <ul className={styles.grid}>
          {reasons.map((reason) => (
            <li key={reason.title} className={styles.card}>
              <span className={styles.iconWrap}>
                <Icon name={reason.icon} size={22} />
              </span>
              <h3 className={styles.title}>{reason.title}</h3>
              <p className={styles.desc}>{reason.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
