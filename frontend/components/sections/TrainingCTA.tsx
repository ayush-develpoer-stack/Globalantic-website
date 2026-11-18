import Link from 'next/link';
import { GraduationCap, ArrowRight } from 'lucide-react';
import styles from './TrainingCTA.module.css';

/** Small, understated band promoting the paid internship program. */
export function TrainingCTA() {
  return (
    <section className={`section-sm ${styles.wrap}`}>
      <div className="container">
        <div className={styles.band}>
          <span className={styles.iconWrap}>
            <GraduationCap size={22} />
          </span>
          <div className={styles.text}>
            <h3 className={styles.title}>Full Stack Development — Paid Internship Program</h3>
            <p className={styles.desc}>
              A 6-month paid internship program for aspiring developers, offered offline in Bhopal or online
              across India. Learn by building real projects alongside our team.
            </p>
          </div>
          <Link href="/training" className={styles.link}>
            Learn more <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
