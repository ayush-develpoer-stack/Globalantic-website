// Copied verbatim from prisma/data/solutions.ts — the seed data is the source of truth.
// Re-copy when the seed changes. Used only in mock mode (lib/mock).

export interface SolutionSeed {
  slug: string;
  title: string;
  tagline: string;
  icon: string;
  shortDesc: string;
  overview: string;
  features: string[];
  benefits: string[];
  technologies: string[];
  useCases: string[];
  faqs: { question: string; answer: string }[];
  order: number;
}

export const solutions: SolutionSeed[] = [
  {
    slug: 'crm',
    title: 'CRM Solution',
    tagline: 'Manage leads, customers and sales in one place',
    icon: 'Users',
    shortDesc: 'A centralized CRM to capture leads, track interactions and grow revenue.',
    overview:
      'Our CRM solution gives your team one place to manage contacts, track every interaction and move deals through a clear pipeline — so nothing falls through the cracks.',
    features: ['Lead & contact management', 'Sales pipeline tracking', 'Follow-up reminders', 'Reports & dashboards', 'Team roles & permissions'],
    benefits: ['A single view of every customer', 'Consistent follow-up', 'Clear pipeline visibility', 'Better conversion rates'],
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL'],
    useCases: ['Sales teams', 'Agencies', 'Service businesses', 'B2B companies'],
    faqs: [{ question: 'Can it be customized to our sales process?', answer: 'Yes. The CRM is built around your specific stages, fields and workflows.' }],
    order: 1,
  },
  {
    slug: 'erp',
    title: 'ERP Solution',
    tagline: 'Connect operations, inventory and finance',
    icon: 'Building2',
    shortDesc: 'An integrated ERP connecting your core business functions in real time.',
    overview:
      'Our ERP solution unifies inventory, sales, purchasing, finance and HR into one connected platform with real-time visibility across departments.',
    features: ['Inventory management', 'Sales & purchasing', 'Finance & invoicing', 'HR modules', 'Real-time dashboards'],
    benefits: ['One source of truth', 'Less manual work', 'Real-time visibility', 'Modular growth'],
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL'],
    useCases: ['Manufacturing', 'Distribution', 'Retail', 'Services'],
    faqs: [{ question: 'Can we start with a few modules?', answer: 'Yes. We often begin with core modules and expand in phases.' }],
    order: 2,
  },
  {
    slug: 'business-management',
    title: 'Business Management System',
    tagline: 'Run day-to-day operations from one dashboard',
    icon: 'LayoutDashboard',
    shortDesc: 'An all-in-one system to manage operations, teams and workflows.',
    overview:
      'A business management system tailored to your operations — centralizing tasks, teams, projects and data so you can run your business from a single, clear dashboard.',
    features: ['Task & project tracking', 'Team collaboration', 'Document management', 'Custom workflows', 'Reporting'],
    benefits: ['Centralized operations', 'Improved accountability', 'Automated workflows', 'Clear reporting'],
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL'],
    useCases: ['SMEs', 'Agencies', 'Operations teams', 'Multi-branch businesses'],
    faqs: [{ question: 'Is it tailored to us?', answer: 'Yes. The system is built around your specific processes and needs.' }],
    order: 3,
  },
  {
    slug: 'appointment-system',
    title: 'Appointment & Booking System',
    tagline: 'Let customers book online, around the clock',
    icon: 'CalendarCheck',
    shortDesc: 'Online scheduling with reminders and calendar management.',
    overview:
      'An appointment and booking system that lets customers schedule online, reduces no-shows with reminders and gives your team a clear view of the calendar.',
    features: ['Online booking', 'Calendar management', 'Automated reminders', 'Staff scheduling', 'Payments (optional)'],
    benefits: ['24/7 online booking', 'Fewer no-shows', 'Less admin work', 'Better customer experience'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    useCases: ['Clinics', 'Salons & spas', 'Consultants', 'Service providers'],
    faqs: [{ question: 'Can customers pay when booking?', answer: 'Yes. We can integrate payments so customers can pay or deposit at booking.' }],
    order: 4,
  },
  {
    slug: 'learning-platform',
    title: 'Learning Platform (LMS)',
    tagline: 'Deliver courses and training online',
    icon: 'GraduationCap',
    shortDesc: 'A learning management system for courses, students and progress.',
    overview:
      'A learning platform to host courses, manage students, track progress and deliver content online — with quizzes, certificates and role-based access.',
    features: ['Course & lesson management', 'Student enrollment', 'Progress tracking', 'Quizzes & assessments', 'Certificates'],
    benefits: ['Scalable online learning', 'Automated enrollment', 'Progress insights', 'Professional experience'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    useCases: ['Training institutes', 'Coaching businesses', 'Corporate training', 'Course creators'],
    faqs: [{ question: 'Does it support paid courses?', answer: 'Yes. We can integrate payments and access control for paid content.' }],
    order: 5,
  },
  {
    slug: 'ecommerce',
    title: 'E-commerce Platform',
    tagline: 'Sell online with a fast, manageable store',
    icon: 'ShoppingCart',
    shortDesc: 'A complete online store with catalog, checkout and order management.',
    overview:
      'A performant e-commerce platform with product catalog, secure checkout, payments and an admin panel that makes managing products and orders simple.',
    features: ['Product catalog', 'Cart & checkout', 'Payments', 'Order management', 'Promotions'],
    benefits: ['Faster, converting store', 'Easy management', 'Secure checkout', 'Ready to scale'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    useCases: ['Retail brands', 'D2C businesses', 'Marketplaces', 'Subscriptions'],
    faqs: [{ question: 'Can you migrate our existing store?', answer: 'Yes. We help migrate products, customers and orders where possible.' }],
    order: 6,
  },
  {
    slug: 'custom-saas',
    title: 'Custom SaaS Platform',
    tagline: 'Launch and scale your software product',
    icon: 'Rocket',
    shortDesc: 'End-to-end SaaS platforms with subscriptions and multi-tenancy.',
    overview:
      'We build SaaS platforms from the ground up — with authentication, subscriptions, multi-tenancy and dashboards — engineered to scale as your user base grows.',
    features: ['Multi-tenant architecture', 'Subscriptions & billing', 'User & team management', 'Dashboards & analytics', 'Scalable APIs'],
    benefits: ['A market-ready product', 'Recurring revenue support', 'Scalable foundation', 'Full ownership'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL', 'TypeScript'],
    useCases: ['Startups', 'Product founders', 'B2B tools', 'Vertical SaaS'],
    faqs: [{ question: 'Can you help from MVP to scale?', answer: 'Yes. We can start with an MVP and grow the platform as you validate and expand.' }],
    order: 7,
  },
  {
    slug: 'ai-automation',
    title: 'AI Automation',
    tagline: 'Automate work with practical AI',
    icon: 'Sparkles',
    shortDesc: 'AI-powered automation for repetitive tasks and workflows.',
    overview:
      'We apply AI to automate repetitive tasks — from content and document processing to smart assistants — freeing your team to focus on higher-value work.',
    features: ['AI assistants', 'Document processing', 'Content generation', 'Workflow automation', 'System integration'],
    benefits: ['Save time on manual work', 'Smarter workflows', 'Faster turnaround', 'Scalable automation'],
    technologies: ['OpenAI', 'Gemini', 'Node.js', 'Next.js'],
    useCases: ['Support automation', 'Content workflows', 'Data processing', 'Internal assistants'],
    faqs: [{ question: 'Where should we start with AI?', answer: 'We help identify the highest-impact, lowest-risk use cases first.' }],
    order: 8,
  },
  {
    slug: 'business-dashboard',
    title: 'Business Dashboard',
    tagline: 'See your key metrics in real time',
    icon: 'BarChart3',
    shortDesc: 'Custom dashboards that turn your data into clear insights.',
    overview:
      'Custom business dashboards that pull data from your systems and present the metrics that matter in clear, real-time visualizations.',
    features: ['Custom metrics & KPIs', 'Data integrations', 'Real-time charts', 'Role-based views', 'Exportable reports'],
    benefits: ['Data-driven decisions', 'Real-time visibility', 'One place for metrics', 'Clear reporting'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    useCases: ['Leadership teams', 'Sales & marketing', 'Operations', 'Finance'],
    faqs: [{ question: 'Can it connect to our data sources?', answer: 'Yes. We integrate with your databases, APIs and third-party tools.' }],
    order: 9,
  },
  {
    slug: 'internal-tools',
    title: 'Internal Tools',
    tagline: 'Custom tools that streamline your operations',
    icon: 'Wrench',
    shortDesc: 'Purpose-built internal tools to replace spreadsheets and manual work.',
    overview:
      'We build internal tools tailored to your team — admin panels, operations tools and back-office systems that replace fragile spreadsheets and manual processes.',
    features: ['Admin panels', 'Data entry & management', 'Approval workflows', 'Role-based access', 'Integrations'],
    benefits: ['Less manual work', 'Fewer errors', 'Faster operations', 'Better data control'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    useCases: ['Operations teams', 'Back-office', 'Support teams', 'Finance'],
    faqs: [{ question: 'Can these replace our spreadsheets?', answer: 'Yes. We commonly replace spreadsheet-based processes with reliable custom tools.' }],
    order: 10,
  },
];
