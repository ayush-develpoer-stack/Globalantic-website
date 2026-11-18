import {
  Bell,
  Boxes,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  FileText,
  Globe,
  Heart,
  LayoutGrid,
  Lock,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Target,
  Users,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import type React from 'react';
import styles from './HeroVisual.module.css';

/**
 * Original illustrative compositions for page heroes (no screenshots, no numbers, no claims).
 * Every visual is decorative (aria-hidden): the meaning is carried by the page text.
 * Variants match the service `heroVariant` values accepted by the backend.
 */
export const HERO_VARIANTS = [
  'browser',
  'webapp',
  'mobile',
  'dashboard',
  'workflow',
  'crm',
  'erp',
  'commerce',
  'design',
  'api',
  'cloud',
  'maintenance',
  'search',
  'answers',
  'generative',
  'marketing',
  'social',
  'ads',
  'brand',
] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

/** Accent per variant (chart tokens are contrast-checked in both themes). */
const ACCENT: Record<HeroVariant, string> = {
  browser: 'var(--chart-1)',
  webapp: 'var(--chart-5)',
  mobile: 'var(--chart-4)',
  dashboard: 'var(--chart-1)',
  workflow: 'var(--chart-2)',
  crm: 'var(--chart-5)',
  erp: 'var(--chart-3)',
  commerce: 'var(--chart-4)',
  design: 'var(--chart-4)',
  api: 'var(--chart-2)',
  cloud: 'var(--chart-5)',
  maintenance: 'var(--chart-2)',
  search: 'var(--chart-3)',
  answers: 'var(--chart-2)',
  generative: 'var(--chart-1)',
  marketing: 'var(--chart-3)',
  social: 'var(--chart-4)',
  ads: 'var(--chart-5)',
  brand: 'var(--chart-1)',
};

/** Fallback style for services created in the CMS without a hero style. */
const SLUG_VARIANT: Record<string, HeroVariant> = {
  'web-development': 'browser',
  'web-application-development': 'webapp',
  'software-development': 'dashboard',
  'mobile-app-development': 'mobile',
  'ai-solutions': 'workflow',
  'crm-development': 'crm',
  'erp-development': 'erp',
  'ecommerce-development': 'commerce',
  'ui-ux-design': 'design',
  'api-integration': 'api',
  'cloud-services': 'cloud',
  'website-maintenance': 'maintenance',
  seo: 'search',
  aeo: 'answers',
  geo: 'generative',
  'digital-marketing': 'marketing',
  'social-media-marketing': 'social',
  'google-meta-ads': 'ads',
  branding: 'brand',
};

export function resolveVariant(variant?: string | null, slug?: string): HeroVariant {
  if (variant && (HERO_VARIANTS as readonly string[]).includes(variant)) return variant as HeroVariant;
  if (slug && SLUG_VARIANT[slug]) return SLUG_VARIANT[slug];
  return 'browser';
}

export const accentFor = (v: HeroVariant) => ACCENT[v];

const Bars = ({ n = 3, w = [90, 70, 50] }: { n?: number; w?: number[] }) => (
  <div className={styles.bars}>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} style={{ width: `${w[i % w.length]}%` }} />
    ))}
  </div>
);

const Chrome = ({ url }: { url?: string }) => (
  <div className={styles.chrome}>
    <i />
    <i />
    <i />
    {url && <span className={styles.url}>{url}</span>}
  </div>
);

function Browser() {
  return (
    <>
      <div className={`${styles.window} ${styles.main}`}>
        <Chrome url="yourbusiness.com" />
        <div className={styles.siteNav}>
          <span className={styles.logoDot} />
          <Bars n={1} w={[30]} />
          <span className={styles.pillBtn} />
        </div>
        <div className={styles.siteHero}>
          <div>
            <Bars n={3} w={[85, 65, 40]} />
            <span className={styles.ctaBlock} />
          </div>
          <div className={styles.imageBlock} />
        </div>
        <div className={styles.cards3}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.miniCard}>
              <span className={styles.iconDot} />
              <Bars n={2} w={[80, 55]} />
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.phone} ${styles.phoneFloat}`}>
        <span className={styles.notch} />
        <div className={styles.imageBlock} />
        <Bars n={3} w={[90, 60, 75]} />
        <span className={styles.ctaBlock} />
      </div>
    </>
  );
}

function WebApp() {
  return (
    <>
      <div className={`${styles.window} ${styles.main}`}>
        <Chrome url="app.yourbusiness.com" />
        <div className={styles.appShell}>
          <aside className={styles.sidebar}>
            {[LayoutGrid, Users, FileText, Settings2].map((I, i) => (
              <span key={i} className={i === 0 ? styles.sideActive : ''}>
                <I size={13} />
              </span>
            ))}
          </aside>
          <div className={styles.appBody}>
            <div className={styles.toolbar}>
              <Bars n={1} w={[40]} />
              <span className={styles.pillBtn} />
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.tableRow}>
                <span className={styles.avatar} />
                <Bars n={1} w={[60 + ((i * 13) % 30)]} />
                <span className={i % 2 ? styles.tagSoft : styles.tagAccent} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`${styles.floatCard} ${styles.floatTopRight}`}>
        <Lock size={14} />
        <div>
          <strong>Secure sign-in</strong>
          <small>Roles &amp; permissions</small>
        </div>
      </div>
    </>
  );
}

function Mobile() {
  return (
    <div className={styles.phoneRow}>
      <div className={styles.phone}>
        <span className={styles.notch} />
        <div className={styles.phoneHeader}>
          <span className={styles.avatar} />
          <Bars n={1} w={[50]} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.listItem}>
            <span className={styles.iconDot} />
            <Bars n={2} w={[80, 50]} />
          </div>
        ))}
        <div className={styles.tabBar}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i === 0 ? styles.tabActive : ''} />
          ))}
        </div>
      </div>
      <div className={`${styles.phone} ${styles.phoneBack}`}>
        <span className={styles.notch} />
        <div className={styles.imageBlock} />
        <Bars n={3} w={[85, 65, 45]} />
        <span className={styles.ctaBlock} />
      </div>
      <div className={`${styles.floatCard} ${styles.floatMid}`}>
        <Bell size={14} />
        <div>
          <strong>Push notification</strong>
          <small>iOS &amp; Android</small>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className={`${styles.window} ${styles.main}`}>
      <Chrome />
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          {[LayoutGrid, Boxes, Users, Settings2].map((I, i) => (
            <span key={i} className={i === 1 ? styles.sideActive : ''}>
              <I size={13} />
            </span>
          ))}
        </aside>
        <div className={styles.appBody}>
          <div className={styles.tiles}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.tile}>
                <Bars n={2} w={[45, 70]} />
              </div>
            ))}
          </div>
          <div className={styles.chartPanel}>
            <svg viewBox="0 0 300 100" preserveAspectRatio="none">
              <path className={styles.area} d="M0,80 C40,70 60,40 100,48 C140,56 160,22 200,28 C240,34 260,12 300,16 L300,100 L0,100 Z" />
              <path className={styles.line} d="M0,80 C40,70 60,40 100,48 C140,56 160,22 200,28 C240,34 260,12 300,16" />
            </svg>
          </div>
          <div className={styles.columns}>
            {[60, 85, 45, 70, 90, 55, 75].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Flow() {
  const steps = [
    { I: Zap, t: 'Trigger' },
    { I: Sparkles, t: 'AI step' },
    { I: Users, t: 'Review' },
    { I: CheckCircle2, t: 'Done' },
  ];
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.flow}>
        {steps.map(({ I, t }, i) => (
          <div key={t} className={styles.flowStep} style={{ animationDelay: `${i * 0.4}s` }}>
            <span className={styles.flowIcon}>
              <I size={18} />
            </span>
            <strong>{t}</strong>
            <Bars n={1} w={[70]} />
          </div>
        ))}
      </div>
      <div className={styles.flowFooter}>
        <Workflow size={14} /> <span>Automated workflow</span>
      </div>
    </div>
  );
}

function Crm() {
  const cols = ['New', 'Contacted', 'Proposal', 'Won'];
  return (
    <div className={`${styles.window} ${styles.main}`}>
      <Chrome />
      <div className={styles.kanban}>
        {cols.map((c, ci) => (
          <div key={c} className={styles.kanbanCol}>
            <span className={styles.colTitle}>{c}</span>
            {Array.from({ length: 3 - (ci % 2) }, (_, i) => (
              <div key={i} className={styles.dealCard}>
                <span className={styles.avatar} />
                <Bars n={2} w={[85, 55]} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Erp() {
  const mods = [
    { I: Boxes, t: 'Inventory' },
    { I: ShoppingCart, t: 'Purchase' },
    { I: Target, t: 'Sales' },
    { I: FileText, t: 'Accounts' },
    { I: Users, t: 'People' },
    { I: Server, t: 'Reports' },
  ];
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.hub}>
        <span className={styles.hubCore}>
          <Database size={22} />
        </span>
        {mods.map(({ I, t }, i) => (
          <div key={t} className={styles.hubNode} style={{ left: `${50 + 38 * Math.cos(((i * 60 - 90) * Math.PI) / 180)}%`, top: `${50 + 38 * Math.sin(((i * 60 - 90) * Math.PI) / 180)}%` }}>
            <I size={15} />
            <small>{t}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Commerce() {
  return (
    <>
      <div className={`${styles.window} ${styles.main}`}>
        <Chrome url="shop.yourbrand.com" />
        <div className={styles.toolbar}>
          <Bars n={1} w={[35]} />
          <span className={styles.cartBadge}>
            <ShoppingCart size={13} />
          </span>
        </div>
        <div className={styles.products}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={styles.product}>
              <div className={styles.productImg} />
              <Bars n={2} w={[80, 40]} />
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.floatCard} ${styles.floatBottomRight}`}>
        <ShieldCheck size={14} />
        <div>
          <strong>Secure checkout</strong>
          <small>Cards, UPI &amp; wallets</small>
        </div>
      </div>
    </>
  );
}

function Design() {
  return (
    <div className={`${styles.board} ${styles.main} ${styles.canvas}`}>
      <div className={styles.frames}>
        <div className={styles.frame}>
          <div className={styles.imageBlock} />
          <Bars n={2} w={[80, 50]} />
          <span className={styles.ctaBlock} />
        </div>
        <div className={`${styles.frame} ${styles.frameSelected}`}>
          <Bars n={3} w={[70, 90, 55]} />
          <span className={styles.ctaBlock} />
        </div>
      </div>
      <div className={styles.designBar}>
        <span className={styles.typeSpec}>Aa</span>
        <div className={styles.swatches}>
          {['var(--chart-1)', 'var(--chart-4)', 'var(--chart-2)', 'var(--secondary)', 'var(--accent)'].map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Api() {
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.apiGrid}>
        <div className={styles.code}>
          <span className={styles.method}>GET</span> <span>/api/orders</span>
          <br />
          <span className={styles.method}>POST</span> <span>/api/webhooks</span>
          <br />
          <span className={styles.muted}>{'{'}</span>
          <br />
          &nbsp;&nbsp;<span className={styles.key}>&quot;status&quot;</span>: <span className={styles.str}>&quot;ok&quot;</span>
          <br />
          <span className={styles.muted}>{'}'}</span>
        </div>
        <div className={styles.connectors}>
          {[
            { I: Globe, t: 'Website' },
            { I: Database, t: 'CRM' },
            { I: ShoppingCart, t: 'Payments' },
          ].map(({ I, t }) => (
            <div key={t} className={styles.connector}>
              <I size={14} />
              <small>{t}</small>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.flowFooter}>
        <Code2 size={14} /> <span>Documented, signed &amp; logged</span>
      </div>
    </div>
  );
}

function CloudV() {
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.cloudTop}>
        <Cloud size={56} strokeWidth={1.4} />
        <div className={styles.servers}>
          {[0, 1, 2].map((i) => (
            <span key={i}>
              <Server size={14} />
            </span>
          ))}
        </div>
      </div>
      <div className={styles.pipeline}>
        {['Build', 'Test', 'Deploy', 'Monitor'].map((s, i) => (
          <div key={s} className={styles.pipeStep} style={{ animationDelay: `${i * 0.35}s` }}>
            <Check size={12} />
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Maintenance() {
  return (
    <>
      <div className={`${styles.board} ${styles.main}`}>
        <div className={styles.checklist}>
          {['Updates applied', 'Backups checked', 'Security patches', 'Monitoring active', 'Content changes'].map((t) => (
            <div key={t} className={styles.checkRow}>
              <span className={styles.checkDot}>
                <Check size={12} />
              </span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.floatCard} ${styles.floatTopRight}`}>
        <Wrench size={14} />
        <div>
          <strong>Care plan</strong>
          <small>Scheduled &amp; logged</small>
        </div>
      </div>
    </>
  );
}

function SearchV() {
  return (
    <div className={`${styles.window} ${styles.main}`}>
      <Chrome />
      <div className={styles.searchBox}>
        <Search size={14} />
        <Bars n={1} w={[55]} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${styles.result} ${i === 0 ? styles.resultTop : ''}`}>
          <span className={styles.resultUrl} />
          <span className={styles.resultTitle} />
          <Bars n={2} w={[95, 70]} />
        </div>
      ))}
      <div className={styles.chips}>
        <span>Fast pages</span>
        <span>Structured data</span>
        <span>Clear headings</span>
      </div>
    </div>
  );
}

function Answers() {
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.qa}>
        <div className={styles.question}>
          <MessageSquareText size={14} />
          <span>How long does a website take?</span>
        </div>
        <div className={styles.answer}>
          <strong>Short answer</strong>
          <Bars n={2} w={[95, 60]} />
        </div>
        {['What does it cost to start?', 'Can I update it myself?'].map((q) => (
          <div key={q} className={styles.faqRow}>
            <span>{q}</span>
            <span aria-hidden>+</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Generative() {
  return (
    <div className={`${styles.window} ${styles.main}`}>
      <Chrome />
      <div className={styles.chat}>
        <div className={styles.userMsg}>
          <Bars n={1} w={[80]} />
        </div>
        <div className={styles.botMsg}>
          <Sparkles size={14} />
          <div>
            <Bars n={3} w={[95, 85, 60]} />
            <div className={styles.sources}>
              {[0, 1, 2].map((i) => (
                <span key={i}>
                  <FileText size={11} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.chips}>
        <span>Clear facts</span>
        <span>Consistent details</span>
        <span>Crawlable pages</span>
      </div>
    </div>
  );
}

function Marketing() {
  return (
    <div className={`${styles.board} ${styles.main}`}>
      <div className={styles.funnel}>
        {['Reach', 'Interest', 'Enquiry', 'Customer'].map((t, i) => (
          <div key={t} style={{ width: `${100 - i * 18}%` }}>
            {t}
          </div>
        ))}
      </div>
      <div className={styles.chips}>
        <span>
          <Search size={11} /> Search
        </span>
        <span>
          <Megaphone size={11} /> Social
        </span>
        <span>
          <MessageCircle size={11} /> Email
        </span>
      </div>
    </div>
  );
}

function Social() {
  return (
    <div className={styles.phoneRow}>
      <div className={`${styles.board} ${styles.postGrid}`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.post} style={{ ['--i' as string]: i } as React.CSSProperties} />
        ))}
      </div>
      <div className={`${styles.phone} ${styles.phoneFloat}`}>
        <span className={styles.notch} />
        <div className={styles.phoneHeader}>
          <span className={styles.avatar} />
          <Bars n={1} w={[45]} />
        </div>
        <div className={styles.imageBlock} />
        <div className={styles.reactions}>
          <Heart size={12} /> <MessageCircle size={12} />
        </div>
        <Bars n={2} w={[85, 55]} />
      </div>
    </div>
  );
}

function Ads() {
  return (
    <>
      <div className={`${styles.board} ${styles.main}`}>
        <div className={styles.adCard}>
          <small className={styles.sponsored}>Sponsored</small>
          <div className={styles.imageBlock} />
          <Bars n={2} w={[85, 55]} />
          <span className={styles.ctaBlock} />
        </div>
        <div className={styles.chips}>
          <span>
            <Target size={11} /> Audience
          </span>
          <span>Location</span>
          <span>Keywords</span>
        </div>
      </div>
      <div className={`${styles.floatCard} ${styles.floatBottomRight}`}>
        <Megaphone size={14} />
        <div>
          <strong>Campaign tracking</strong>
          <small>UTM-tagged links</small>
        </div>
      </div>
    </>
  );
}

function Brand() {
  return (
    <div className={`${styles.board} ${styles.main} ${styles.canvas}`}>
      <div className={styles.brandGrid}>
        <div className={styles.markBuild}>
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" />
            <circle cx="50" cy="50" r="24" />
            <line x1="10" y1="50" x2="90" y2="50" />
            <line x1="50" y1="10" x2="50" y2="90" />
            <path className={styles.markShape} d="M50 18 C72 18 82 34 82 50 C66 50 56 40 50 18 Z M50 82 C28 82 18 66 18 50 C34 50 44 60 50 82 Z" />
          </svg>
        </div>
        <div className={styles.brandSide}>
          <span className={styles.typeSpec}>Aa</span>
          <div className={styles.swatches}>
            {['var(--chart-1)', 'var(--secondary)', 'var(--accent)', 'var(--chart-3)'].map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </div>
          <Bars n={2} w={[80, 55]} />
        </div>
      </div>
    </div>
  );
}

const RENDER: Record<HeroVariant, () => React.JSX.Element> = {
  browser: Browser,
  webapp: WebApp,
  mobile: Mobile,
  dashboard: Dashboard,
  workflow: Flow,
  crm: Crm,
  erp: Erp,
  commerce: Commerce,
  design: Design,
  api: Api,
  cloud: CloudV,
  maintenance: Maintenance,
  search: SearchV,
  answers: Answers,
  generative: Generative,
  marketing: Marketing,
  social: Social,
  ads: Ads,
  brand: Brand,
};

export function HeroVisual({ variant, className }: { variant: HeroVariant; className?: string }) {
  const Render = RENDER[variant];
  return (
    <div className={`${styles.stage} ${className ?? ''}`} style={{ ['--va' as string]: ACCENT[variant] } as React.CSSProperties} aria-hidden="true" data-variant={variant}>
      <div className={styles.glow} />
      <Render />
    </div>
  );
}
