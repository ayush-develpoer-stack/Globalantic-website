import styles from './ProcessSteps.module.css';

interface Step {
  title: string;
  description: string;
}

interface ProcessStepsProps {
  steps: Step[];
}

/** Numbered process steps. */
export function ProcessSteps({ steps }: ProcessStepsProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <ol className={styles.list}>
      {steps.map((step, i) => (
        <li key={i} className={styles.step}>
          <span className={styles.number} aria-hidden>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className={styles.content}>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.desc}>{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
