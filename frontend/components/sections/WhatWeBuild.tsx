import { Icon } from '@/components/ui/Icon';
import { SectionHeading } from '@/components/ui/SectionHeading';
import styles from './WhatWeBuild.module.css';

const items = [
  {
    icon: 'Globe',
    title: 'Websites',
    description: 'Fast, responsive marketing sites and corporate websites built to convert and rank.',
  },
  {
    icon: 'LayoutDashboard',
    title: 'Web Apps',
    description: 'Interactive, data-driven web applications and dashboards for real business workflows.',
  },
  {
    icon: 'Smartphone',
    title: 'Mobile Apps',
    description: 'Cross-platform and native mobile experiences that feel at home on every device.',
  },
  {
    icon: 'Code2',
    title: 'Software Platforms',
    description: 'Custom SaaS and internal platforms engineered to scale with your organisation.',
  },
  {
    icon: 'Sparkles',
    title: 'AI Solutions',
    description: 'Practical AI features — automation, assistants and insights woven into your product.',
  },
  {
    icon: 'Building2',
    title: 'Business Systems',
    description: 'CRM, ERP and operational tools that connect your teams, data and processes.',
  },
];

/** Grid overview of the kinds of products Globalantic builds. */
export function WhatWeBuild() {
  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="What we build"
          title="Everything your product needs, under one roof"
          description="From a single website to a full software platform, we design and engineer the digital foundations your business runs on."
        />

        <ul className={styles.grid}>
          {items.map((item) => (
            <li key={item.title} className={styles.card}>
              <span className={styles.iconWrap}>
                <Icon name={item.icon} size={24} />
              </span>
              <div>
                <h3 className={styles.title}>{item.title}</h3>
                <p className={styles.desc}>{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
