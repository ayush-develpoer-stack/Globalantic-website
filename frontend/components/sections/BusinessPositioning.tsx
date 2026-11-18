import { Icon } from '@/components/ui/Icon';
import styles from './BusinessPositioning.module.css';

const valueProps = [
  {
    icon: 'Code2',
    title: 'Product-focused engineering',
    description: 'We build software as a product — thoughtfully architected, maintainable and made to last.',
  },
  {
    icon: 'Sparkles',
    title: 'Modern technology',
    description: 'A current, proven stack across web, mobile, cloud and AI — chosen to fit the problem, not the trend.',
  },
  {
    icon: 'TrendingUp',
    title: 'Business outcomes',
    description: 'Every decision maps back to the result you care about: growth, efficiency and a better experience.',
  },
  {
    icon: 'Users',
    title: 'Long-term partnership',
    description: 'We stay involved beyond launch — supporting, improving and scaling what we build with you.',
  },
];

/** Statement band that frames what Globalantic does and how it approaches work. */
export function BusinessPositioning() {
  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <div className={styles.statement}>
          <span className="eyebrow">What we do</span>
          <h2 className={styles.headline}>
            We build digital products, software and technology solutions that help{' '}
            <span className="text-gradient">businesses grow.</span>
          </h2>
          <p className={styles.lead}>
            From the first idea to a running product, we design, engineer and support the systems your
            business relies on — combining clean design, solid engineering and a clear focus on the outcomes
            that matter to you.
          </p>
        </div>

        <ul className={styles.props}>
          {valueProps.map((prop) => (
            <li key={prop.title} className={styles.prop}>
              <span className={styles.iconWrap}>
                <Icon name={prop.icon} size={22} />
              </span>
              <h3 className={styles.propTitle}>{prop.title}</h3>
              <p className={styles.propDesc}>{prop.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
