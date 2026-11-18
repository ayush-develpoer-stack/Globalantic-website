'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Users, BarChart3, Cloud, Smartphone } from 'lucide-react';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import styles from './Hero.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: 'easeOut' },
  }),
};

const highlights = ['Web & Software', 'Mobile Apps', 'AI Solutions', 'Cloud & DevOps'];

const capabilities = [
  { label: 'Web', value: 'Development' },
  { label: 'Software', value: 'Engineering' },
  { label: 'Mobile', value: 'Apps' },
  { label: 'AI', value: 'Solutions' },
  { label: 'CRM & ERP', value: 'Systems' },
  { label: 'Digital', value: 'Growth' },
];

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`${styles.grid} bg-grid`} aria-hidden />
      <div className={styles.glow} aria-hidden />
      <div className={styles.glowTwo} aria-hidden />

      <div className={`container ${styles.inner}`}>
        <div className={styles.content}>
          <motion.span
            className={styles.badge}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0}
          >
            <span className={styles.dot} /> IT &amp; Digital Solutions Company
          </motion.span>

          <motion.h1 className={styles.title} variants={fadeUp} initial="hidden" animate="show" custom={1}>
            We Build Digital Solutions That{' '}
            <span className="text-gradient">Move Businesses Forward.</span>
          </motion.h1>

          <motion.p className={styles.subtitle} variants={fadeUp} initial="hidden" animate="show" custom={2}>
            Globalantic designs and builds websites, software, mobile applications, AI solutions,
            business systems and digital growth strategies — engineered to help your business scale.
          </motion.p>

          <motion.div className={styles.actions} variants={fadeUp} initial="hidden" animate="show" custom={3}>
            <TrackedLink href="/get-a-quote" label="home_hero_consultation" className={styles.primary}>
              Get a Free Consultation <ArrowRight size={18} />
            </TrackedLink>
            <WhatsAppButton label="home_hero" size="lg" variant="outline" />
          </motion.div>

          <motion.ul className={styles.highlights} variants={fadeUp} initial="hidden" animate="show" custom={4}>
            {highlights.map((h) => (
              <li key={h}>
                <Check size={15} /> {h}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          className={styles.visual}
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: 'easeOut' }}
        >
          <HeroVisual />
        </motion.div>
      </div>

      <div className={`container ${styles.capabilities}`}>
        {capabilities.map((c) => (
          <div key={c.label} className={styles.capability}>
            <span className={styles.capLabel}>{c.label}</span>
            <span className={styles.capValue}>{c.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const float = {
  hidden: { opacity: 0, y: 14, scale: 0.9 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, delay: 0.5 + i * 0.12, ease: 'easeOut' },
  }),
};

/** A stylised product/dashboard visual built entirely from markup — no stock imagery. */
function HeroVisual() {
  return (
    <div className={styles.stage} aria-hidden>
      <div className={styles.window}>
        <div className={styles.windowBar}>
          <span className={styles.trafficRed} />
          <span className={styles.trafficYellow} />
          <span className={styles.trafficGreen} />
          <span className={styles.windowTitle}>globalantic — dashboard</span>
        </div>
        <div className={styles.windowBody}>
          <div className={styles.statRow}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Deployments</span>
              <span className={styles.statValue}>Live</span>
              <span className={styles.statBar}>
                <i style={{ width: '82%' }} />
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Monitoring</span>
              <span className={styles.statValue}>Enabled</span>
              <span className={styles.statBar}>
                <i style={{ width: '99%' }} />
              </span>
            </div>
          </div>

          <div className={styles.chart}>
            <svg viewBox="0 0 320 120" preserveAspectRatio="none" width="100%" height="100%">
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(166,108,255,0.5)" />
                  <stop offset="100%" stopColor="rgba(166,108,255,0)" />
                </linearGradient>
              </defs>
              <path
                d="M0,90 C40,70 60,40 90,55 C120,70 140,30 175,35 C210,40 235,15 270,25 C295,32 310,20 320,18 L320,120 L0,120 Z"
                fill="url(#area)"
              />
              <path
                d="M0,90 C40,70 60,40 90,55 C120,70 140,30 175,35 C210,40 235,15 270,25 C295,32 310,20 320,18"
                fill="none"
                stroke="#a66cff"
                strokeWidth="2.5"
              />
            </svg>
          </div>

          <div className={styles.code}>
            <code>
              <span className={styles.kw}>const</span> app = <span className={styles.fn}>build</span>(&#123;
              <br />
              &nbsp;&nbsp;stack: <span className={styles.str}>&apos;next + node&apos;</span>,
              <br />
              &nbsp;&nbsp;scalable: <span className={styles.kw}>true</span>,
              <br />
              &#125;);
            </code>
          </div>
        </div>
      </div>

      {/* Floating capability cards */}
      <motion.div
        className={`${styles.chip} ${styles.chipAi}`}
        variants={float}
        initial="hidden"
        animate="show"
        custom={0}
      >
        <span className={styles.chipIcon}>
          <Sparkles size={16} />
        </span>
        AI Solutions
      </motion.div>

      <motion.div
        className={`${styles.chip} ${styles.chipCrm}`}
        variants={float}
        initial="hidden"
        animate="show"
        custom={1}
      >
        <span className={styles.chipIcon}>
          <Users size={16} />
        </span>
        CRM
      </motion.div>

      <motion.div
        className={`${styles.chip} ${styles.chipAnalytics}`}
        variants={float}
        initial="hidden"
        animate="show"
        custom={2}
      >
        <span className={styles.chipIcon}>
          <BarChart3 size={16} />
        </span>
        Analytics
      </motion.div>

      <motion.div
        className={`${styles.chip} ${styles.chipCloud}`}
        variants={float}
        initial="hidden"
        animate="show"
        custom={3}
      >
        <span className={styles.chipIcon}>
          <Cloud size={16} />
        </span>
        Cloud
      </motion.div>

      <motion.div
        className={`${styles.chip} ${styles.chipMobile}`}
        variants={float}
        initial="hidden"
        animate="show"
        custom={4}
      >
        <span className={styles.chipIcon}>
          <Smartphone size={16} />
        </span>
        Mobile
      </motion.div>
    </div>
  );
}
