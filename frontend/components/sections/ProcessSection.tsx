import { SectionHeading } from '@/components/ui/SectionHeading';
import styles from './ProcessSection.module.css';

const steps = [
  {
    title: 'Discovery',
    description: 'We learn your business, users and goals to define exactly what needs to be built and why.',
  },
  {
    title: 'Planning & Design',
    description: 'We shape the architecture, flows and interface — turning ideas into a clear, testable plan.',
  },
  {
    title: 'Development',
    description: 'We build in focused iterations with clean, well-structured code and regular check-ins.',
  },
  {
    title: 'Testing & QA',
    description: 'We test across devices and scenarios to make sure everything is reliable and secure.',
  },
  {
    title: 'Launch',
    description: 'We deploy carefully, monitor the rollout and make sure everything runs smoothly on day one.',
  },
  {
    title: 'Support & Growth',
    description: 'We keep improving — maintaining, optimising and scaling the product as your business grows.',
  },
];

/** The six-step development process shown as numbered steps. */
export function ProcessSection() {
  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="How we work"
          title="A clear process, from idea to growth"
          description="A transparent way of working that keeps you involved and informed at every stage."
        />

        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.desc}>{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
