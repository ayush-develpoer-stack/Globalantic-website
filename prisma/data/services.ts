export interface ProcessStep {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ServiceSeed {
  slug: string;
  title: string;
  tagline: string;
  icon: string;
  shortDesc: string;
  overview: string;
  problem: string;
  solution: string;
  features: string[];
  deliverables: string[];
  benefits: string[];
  technologies: string[];
  process: ProcessStep[];
  useCases: string[];
  faqs: FaqItem[];
  order: number;
  featured: boolean;
}

const standardProcess: ProcessStep[] = [
  { title: 'Discovery', description: 'We start by understanding your business goals, users and requirements to define a clear scope.' },
  { title: 'Planning & Design', description: 'We map information architecture, user flows and interface designs before development begins.' },
  { title: 'Development', description: 'We build in short iterations with clean, maintainable code and regular checkpoints.' },
  { title: 'Testing & QA', description: 'We test across devices and scenarios to ensure quality, performance and security.' },
  { title: 'Launch', description: 'We deploy to production with monitoring, backups and a smooth go-live process.' },
  { title: 'Support & Growth', description: 'We provide ongoing support, improvements and scaling as your business grows.' },
];

export const services: ServiceSeed[] = [
  {
    slug: 'web-development',
    title: 'Web Development',
    tagline: 'Fast, secure and scalable websites and web applications',
    icon: 'Globe',
    shortDesc: 'Modern, high-performance websites and web applications built with the latest technologies.',
    overview:
      'We design and build websites and web applications that are fast, secure and easy to manage. From marketing sites to complex web platforms, we focus on performance, accessibility and a great user experience across every device.',
    problem:
      'Many businesses struggle with slow, outdated websites that are hard to update, rank poorly on search engines and fail to convert visitors into customers.',
    solution:
      'We build modern web experiences on proven frameworks with clean architecture, optimized performance and content that you can manage yourself — giving you a platform that grows with your business.',
    features: [
      'Responsive, mobile-first design',
      'Server-side rendering for speed and SEO',
      'Content management integration',
      'Custom web applications and dashboards',
      'API integrations and third-party services',
      'Performance and Core Web Vitals optimization',
    ],
    deliverables: [
      'Fully responsive website or web application',
      'Source code and documentation',
      'CMS or admin panel where required',
      'Deployment and hosting setup',
      'Basic SEO and analytics configuration',
    ],
    benefits: [
      'Faster load times and better search rankings',
      'Lower maintenance overhead',
      'A platform you can update without a developer',
      'Room to scale as traffic grows',
    ],
    technologies: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL'],
    process: standardProcess,
    useCases: [
      'Corporate and marketing websites',
      'Web portals and dashboards',
      'Booking and appointment platforms',
      'Custom internal business tools',
    ],
    faqs: [
      { question: 'How long does a website take to build?', answer: 'Timelines depend on scope. A marketing website typically takes 3–6 weeks, while a complex web application can take several months. We share a clear timeline after discovery.' },
      { question: 'Will I be able to update the content myself?', answer: 'Yes. We integrate a content management system or admin panel so your team can update content without writing code.' },
      { question: 'Do you provide hosting and maintenance?', answer: 'We set up reliable hosting and offer ongoing maintenance and support plans if you need them.' },
    ],
    order: 1,
    featured: true,
  },
  {
    slug: 'software-development',
    title: 'Software Development',
    tagline: 'Custom software tailored to how your business actually works',
    icon: 'Code2',
    shortDesc: 'Bespoke software solutions designed around your processes, workflows and goals.',
    overview:
      'We build custom software that fits your business rather than forcing you to adapt to off-the-shelf tools. From internal systems to customer-facing platforms, we deliver reliable, maintainable software engineered for the long term.',
    problem:
      'Generic software often forces teams into rigid workflows, creates data silos and requires costly workarounds that slow the business down.',
    solution:
      'We engineer software around your exact processes, integrate it with your existing tools and build it on a maintainable architecture so it can evolve as your needs change.',
    features: [
      'Custom business logic and workflows',
      'Role-based access and permissions',
      'Reporting and analytics',
      'Third-party and legacy system integrations',
      'Automated processes and notifications',
      'Scalable, well-documented architecture',
    ],
    deliverables: [
      'Custom software application',
      'Technical documentation',
      'Admin and user roles',
      'Deployment and environment setup',
      'Handover and training',
    ],
    benefits: [
      'Software that matches your exact workflow',
      'Reduced manual work through automation',
      'A single source of truth for your data',
      'Long-term maintainability and ownership',
    ],
    technologies: ['Node.js', 'Express.js', 'TypeScript', 'React', 'PostgreSQL', 'MongoDB'],
    process: standardProcess,
    useCases: [
      'Internal management systems',
      'Workflow and process automation',
      'Data-driven reporting platforms',
      'Customer-facing service platforms',
    ],
    faqs: [
      { question: 'Do we own the source code?', answer: 'Yes. On project completion you receive full ownership of the source code and documentation.' },
      { question: 'Can you integrate with our existing systems?', answer: 'Yes. We regularly integrate with existing databases, APIs and third-party services.' },
    ],
    order: 2,
    featured: true,
  },
  {
    slug: 'mobile-app-development',
    title: 'Mobile App Development',
    tagline: 'Cross-platform mobile apps for iOS and Android',
    icon: 'Smartphone',
    shortDesc: 'Native-quality mobile applications for iOS and Android from a single codebase.',
    overview:
      'We build mobile applications that feel fast and native while sharing a single codebase across iOS and Android. From concept to app store, we handle design, development, testing and release.',
    problem:
      'Building and maintaining separate native apps for iOS and Android is expensive and slow, and poorly built apps frustrate users and earn bad reviews.',
    solution:
      'Using cross-platform technology, we deliver a high-quality experience on both platforms from one codebase — reducing cost and time to market without compromising on quality.',
    features: [
      'Cross-platform iOS and Android apps',
      'Smooth, native-feeling interfaces',
      'Offline support and local storage',
      'Push notifications',
      'Secure authentication',
      'App store submission support',
    ],
    deliverables: [
      'iOS and Android application builds',
      'App store submission assets',
      'Backend API where required',
      'Source code and documentation',
    ],
    benefits: [
      'One codebase for two platforms',
      'Faster time to market',
      'Consistent experience across devices',
      'Lower long-term maintenance cost',
    ],
    technologies: ['React Native', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL'],
    process: standardProcess,
    useCases: [
      'Customer engagement apps',
      'On-demand service apps',
      'Internal field and operations apps',
      'Marketplace and booking apps',
    ],
    faqs: [
      { question: 'Do you build for both iOS and Android?', answer: 'Yes. We use cross-platform technology so both platforms are covered from a shared codebase.' },
      { question: 'Can you help with app store submission?', answer: 'Yes. We support the submission process for both the Apple App Store and Google Play.' },
    ],
    order: 3,
    featured: true,
  },
  {
    slug: 'ai-solutions',
    title: 'AI Solutions',
    tagline: 'Practical AI that solves real business problems',
    icon: 'Sparkles',
    shortDesc: 'Integrate AI-powered features and automation into your products and workflows.',
    overview:
      'We help businesses adopt AI in practical, high-impact ways — from chat assistants and content generation to intelligent automation and data analysis — built responsibly on top of leading AI models.',
    problem:
      'Many teams know AI could help but are unsure where it fits, how to integrate it safely or how to move beyond experiments to real production features.',
    solution:
      'We identify high-value use cases, integrate proven AI models into your products and workflows, and ship reliable features with the right guardrails and monitoring.',
    features: [
      'AI chat assistants and copilots',
      'Content and document generation',
      'Intelligent search and recommendations',
      'Workflow and process automation',
      'Data extraction and summarization',
      'Integration with existing systems',
    ],
    deliverables: [
      'AI-powered feature or application',
      'API integration with AI providers',
      'Prompt and workflow configuration',
      'Documentation and handover',
    ],
    benefits: [
      'Automate repetitive, time-consuming tasks',
      'Deliver smarter product experiences',
      'Faster access to insights from your data',
      'A responsible, production-ready approach',
    ],
    technologies: ['OpenAI', 'Gemini', 'OpenRouter', 'Node.js', 'React', 'Next.js'],
    process: standardProcess,
    useCases: [
      'Customer support assistants',
      'Automated content workflows',
      'Document analysis and summarization',
      'Smart search and recommendations',
    ],
    faqs: [
      { question: 'Which AI models do you work with?', answer: 'We integrate leading providers such as OpenAI and Gemini, and route through services like OpenRouter, choosing the best fit for each use case.' },
      { question: 'Is my data safe?', answer: 'We follow provider best practices and design integrations with privacy and security in mind, keeping sensitive data protected.' },
    ],
    order: 4,
    featured: true,
  },
  {
    slug: 'crm-development',
    title: 'CRM Development',
    tagline: 'Custom CRM systems to manage leads and customers',
    icon: 'Users',
    shortDesc: 'Tailored CRM platforms to track leads, customers and sales pipelines.',
    overview:
      'We build CRM systems designed around your sales and customer processes, giving your team a single place to manage leads, track interactions and close more deals.',
    problem:
      'Spreadsheets and disconnected tools make it hard to track leads, follow up consistently and understand your sales pipeline.',
    solution:
      'A custom CRM centralizes your contacts, automates follow-ups and gives you clear visibility into your pipeline and team performance.',
    features: [
      'Lead and contact management',
      'Sales pipeline and stages',
      'Task and follow-up reminders',
      'Email and communication tracking',
      'Reports and dashboards',
      'Role-based team access',
    ],
    deliverables: ['Custom CRM application', 'Admin and team roles', 'Reporting dashboards', 'Data import and setup'],
    benefits: ['A single view of every customer', 'Consistent follow-up and fewer lost leads', 'Clear pipeline visibility', 'Better team accountability'],
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL', 'TypeScript'],
    process: standardProcess,
    useCases: ['Sales teams', 'Service businesses', 'Agencies', 'B2B companies'],
    faqs: [
      { question: 'Can you migrate our existing data?', answer: 'Yes. We help import and structure your existing contacts and records into the new CRM.' },
    ],
    order: 5,
    featured: false,
  },
  {
    slug: 'erp-development',
    title: 'ERP Development',
    tagline: 'Integrated systems to run your entire operation',
    icon: 'Building2',
    shortDesc: 'Custom ERP platforms connecting inventory, finance, HR and operations.',
    overview:
      'We build ERP systems that unify your core business functions — inventory, sales, purchasing, finance and HR — into one connected platform, reducing manual work and giving you real-time visibility.',
    problem:
      'Disconnected tools and manual processes create data silos, errors and a lack of real-time visibility across departments.',
    solution:
      'A tailored ERP connects your departments into one system with shared data, automated workflows and dashboards that reflect your business in real time.',
    features: [
      'Inventory and stock management',
      'Sales and purchase management',
      'Finance and invoicing',
      'HR and payroll modules',
      'Real-time reporting and dashboards',
      'Role-based access control',
    ],
    deliverables: ['Custom ERP platform', 'Configured modules', 'Reporting dashboards', 'Training and handover'],
    benefits: ['One connected source of truth', 'Reduced manual data entry', 'Real-time operational visibility', 'Modular growth over time'],
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL', 'TypeScript'],
    process: standardProcess,
    useCases: ['Manufacturing', 'Distribution and trading', 'Retail chains', 'Service operations'],
    faqs: [
      { question: 'Can the ERP be built in phases?', answer: 'Yes. We often start with core modules and expand over time, so you see value early and manage cost.' },
    ],
    order: 6,
    featured: false,
  },
  {
    slug: 'ecommerce-development',
    title: 'E-commerce Development',
    tagline: 'Online stores built to sell and scale',
    icon: 'ShoppingCart',
    shortDesc: 'High-converting online stores with secure payments and easy management.',
    overview:
      'We build e-commerce stores that are fast, easy to manage and designed to convert. From product catalogs to secure checkout and order management, we cover the full commerce experience.',
    problem:
      'Slow, clunky online stores lose sales, and hard-to-manage platforms make day-to-day operations painful.',
    solution:
      'We build performant storefronts with smooth checkout, secure payments and an admin experience that makes managing products, orders and customers simple.',
    features: [
      'Product catalog and variants',
      'Cart and secure checkout',
      'Payment gateway integration',
      'Order and inventory management',
      'Discounts and promotions',
      'Customer accounts',
    ],
    deliverables: ['E-commerce storefront', 'Admin and order management', 'Payment integration', 'Deployment and setup'],
    benefits: ['Faster stores that convert better', 'Simple product and order management', 'Secure, trusted checkout', 'A platform ready to scale'],
    technologies: ['Next.js', 'React', 'Node.js', 'PostgreSQL', 'WordPress', 'TypeScript'],
    process: standardProcess,
    useCases: ['Retail brands', 'D2C businesses', 'Marketplaces', 'Subscription products'],
    faqs: [
      { question: 'Which payment gateways can you integrate?', answer: 'We integrate popular gateways suited to your region and business, ensuring secure and compliant payments.' },
    ],
    order: 7,
    featured: false,
  },
  {
    slug: 'ui-ux-design',
    title: 'UI/UX Design',
    tagline: 'Interfaces that are intuitive, elegant and effective',
    icon: 'Palette',
    shortDesc: 'User-centered design that makes your product easy and enjoyable to use.',
    overview:
      'We design digital products that are intuitive, accessible and visually refined. Through research, wireframing and prototyping, we create experiences that users understand instantly and enjoy using.',
    problem:
      'Confusing or dated interfaces frustrate users, increase support costs and hurt conversion and retention.',
    solution:
      'We apply a user-centered design process — research, wireframes, prototypes and polished UI — to create products that are clear, consistent and a pleasure to use.',
    features: [
      'User research and flows',
      'Wireframing and prototyping',
      'Design systems and components',
      'Responsive interface design',
      'Accessibility considerations',
      'Usability improvements',
    ],
    deliverables: ['Wireframes and prototypes', 'High-fidelity UI designs', 'Reusable design system', 'Design handoff assets'],
    benefits: ['Higher conversion and engagement', 'Fewer support requests', 'A consistent, on-brand experience', 'Faster development with a design system'],
    technologies: ['React', 'Next.js', 'TypeScript'],
    process: standardProcess,
    useCases: ['New product design', 'Redesigns and revamps', 'Design systems', 'Usability improvements'],
    faqs: [
      { question: 'Do you design and build, or design only?', answer: 'We can do both. We offer design-only engagements as well as full design-and-development delivery.' },
    ],
    order: 8,
    featured: false,
  },
  {
    slug: 'cloud-services',
    title: 'Cloud Services',
    tagline: 'Reliable, scalable cloud infrastructure and deployment',
    icon: 'Cloud',
    shortDesc: 'Cloud hosting, deployment and infrastructure that scales with you.',
    overview:
      'We help you deploy and run applications reliably in the cloud, with the right balance of performance, cost and scalability. From setup to monitoring, we keep your platform stable and secure.',
    problem:
      'Poorly configured infrastructure leads to downtime, security risks, unpredictable costs and difficult scaling.',
    solution:
      'We set up robust cloud environments with automated deployment, monitoring and backups, so your applications stay fast, secure and available as you grow.',
    features: [
      'Cloud deployment and hosting',
      'CI/CD and automated deployments',
      'Environment configuration',
      'Monitoring and backups',
      'Scalability and performance tuning',
      'Security best practices',
    ],
    deliverables: ['Configured cloud environment', 'Deployment pipeline', 'Monitoring and backups', 'Documentation'],
    benefits: ['Reliable uptime', 'Predictable, optimized costs', 'Easy, repeatable deployments', 'Confidence to scale'],
    technologies: ['Vercel', 'Render', 'Supabase', 'Cloudinary', 'Node.js'],
    process: standardProcess,
    useCases: ['App hosting and deployment', 'Scaling growing platforms', 'Migration to the cloud', 'DevOps setup'],
    faqs: [
      { question: 'Which cloud platforms do you use?', answer: 'We work with platforms such as Vercel, Render and Supabase, selecting the best fit for your stack and budget.' },
    ],
    order: 9,
    featured: false,
  },
  {
    slug: 'digital-marketing',
    title: 'Digital Marketing',
    tagline: 'Growth-focused marketing across the channels that matter',
    icon: 'TrendingUp',
    shortDesc: 'Data-driven digital marketing to grow reach, leads and revenue.',
    overview:
      'We help businesses grow online with digital marketing strategies built around measurable results — combining SEO, paid ads, social media and content to attract and convert the right audience.',
    problem:
      'Marketing spend often goes to waste without a clear strategy, measurable goals or the data to know what is working.',
    solution:
      'We build a focused strategy, execute across the right channels and track everything, so your budget goes toward what actually drives leads and revenue.',
    features: [
      'Marketing strategy and planning',
      'SEO and content marketing',
      'Paid advertising campaigns',
      'Social media marketing',
      'Analytics and reporting',
      'Conversion optimization',
    ],
    deliverables: ['Marketing strategy', 'Campaign setup and management', 'Performance reports', 'Optimization recommendations'],
    benefits: ['More qualified traffic and leads', 'Better return on ad spend', 'Clear, measurable results', 'A consistent brand presence'],
    technologies: [],
    process: standardProcess,
    useCases: ['Lead generation', 'Brand awareness', 'Product launches', 'E-commerce growth'],
    faqs: [
      { question: 'How do you measure results?', answer: 'We define clear KPIs up front and report on metrics like traffic, leads, conversions and return on ad spend.' },
    ],
    order: 10,
    featured: false,
  },
  {
    slug: 'seo',
    title: 'SEO',
    tagline: 'Rank higher and earn sustainable organic traffic',
    icon: 'Search',
    shortDesc: 'Technical and content SEO to improve rankings and organic growth.',
    overview:
      'We improve your visibility in search engines through technical optimization, content strategy and on-page best practices — building sustainable organic traffic that compounds over time.',
    problem:
      'Great products go unnoticed when websites are not optimized for search, losing valuable, high-intent organic traffic to competitors.',
    solution:
      'We audit and optimize your site technically and improve content and structure so search engines can find, understand and rank your pages.',
    features: [
      'Technical SEO audits',
      'Keyword research and strategy',
      'On-page optimization',
      'Content structure and metadata',
      'Site speed and Core Web Vitals',
      'Structured data and schema',
    ],
    deliverables: ['SEO audit and action plan', 'On-page optimizations', 'Technical fixes', 'Progress reports'],
    benefits: ['Higher search rankings', 'More qualified organic traffic', 'Better site health and speed', 'Long-term, compounding results'],
    technologies: ['Next.js', 'React'],
    process: standardProcess,
    useCases: ['New site SEO', 'Recovering lost rankings', 'Content and blog SEO', 'Local SEO'],
    faqs: [
      { question: 'How long does SEO take?', answer: 'SEO is a long-term investment. Meaningful results typically appear over 3–6 months, depending on competition and starting point.' },
    ],
    order: 11,
    featured: false,
  },
  {
    slug: 'social-media-marketing',
    title: 'Social Media Marketing',
    tagline: 'Build an engaged audience across social platforms',
    icon: 'Share2',
    shortDesc: 'Content and campaigns that grow your brand on social media.',
    overview:
      'We help brands build a consistent, engaging presence on social media through content planning, community management and campaigns designed to grow reach and engagement.',
    problem:
      'Inconsistent posting and unclear messaging make it hard to build an audience or convert followers into customers.',
    solution:
      'We create a content plan and consistent brand voice, produce engaging content and manage campaigns that grow a genuine, relevant audience.',
    features: [
      'Content planning and calendars',
      'Creative and copywriting',
      'Community engagement',
      'Campaign management',
      'Performance analytics',
    ],
    deliverables: ['Content calendar', 'Social content', 'Campaign management', 'Performance reports'],
    benefits: ['A consistent brand presence', 'Higher engagement and reach', 'Content that supports your goals', 'Data-informed improvements'],
    technologies: [],
    process: standardProcess,
    useCases: ['Brand building', 'Product promotion', 'Community growth', 'Event campaigns'],
    faqs: [
      { question: 'Which platforms do you manage?', answer: 'We focus on the platforms where your audience is most active, such as Instagram, Facebook, LinkedIn and others.' },
    ],
    order: 12,
    featured: false,
  },
  {
    slug: 'google-meta-ads',
    title: 'Google & Meta Ads',
    tagline: 'High-intent paid campaigns that drive measurable results',
    icon: 'Target',
    shortDesc: 'Managed Google Ads and Meta Ads campaigns focused on ROI.',
    overview:
      'We plan, launch and optimize paid advertising campaigns on Google and Meta, targeting the right audiences and continuously improving performance to maximize your return on ad spend.',
    problem:
      'Paid ads can quickly burn budget without careful targeting, testing and optimization based on real performance data.',
    solution:
      'We structure campaigns around clear goals, target high-intent audiences and optimize continuously against conversions — not just clicks.',
    features: [
      'Google Search and Display ads',
      'Meta (Facebook & Instagram) ads',
      'Audience targeting and segmentation',
      'Conversion tracking setup',
      'A/B testing and optimization',
      'Transparent reporting',
    ],
    deliverables: ['Campaign strategy', 'Ad setup and creatives', 'Conversion tracking', 'Performance reports'],
    benefits: ['Reach high-intent audiences fast', 'Better return on ad spend', 'Clear conversion tracking', 'Continuous optimization'],
    technologies: [],
    process: standardProcess,
    useCases: ['Lead generation', 'E-commerce sales', 'App installs', 'Local promotions'],
    faqs: [
      { question: 'What budget do I need?', answer: 'Budgets vary by goal and industry. We recommend a starting budget based on your objectives and help you scale what works.' },
    ],
    order: 13,
    featured: false,
  },
  {
    slug: 'branding',
    title: 'Branding',
    tagline: 'A distinctive brand identity that builds trust',
    icon: 'Feather',
    shortDesc: 'Brand identity, logo and guidelines that make you memorable.',
    overview:
      'We craft brand identities that communicate who you are and build trust with your audience — from logo and visual identity to voice and guidelines that keep everything consistent.',
    problem:
      'An inconsistent or forgettable brand makes it hard to stand out, build recognition and earn customer trust.',
    solution:
      'We develop a cohesive brand identity and clear guidelines so your brand looks and feels consistent everywhere it appears.',
    features: [
      'Logo and visual identity',
      'Color, typography and style',
      'Brand voice and messaging',
      'Brand guidelines',
      'Marketing collateral',
    ],
    deliverables: ['Logo and identity assets', 'Brand guidelines', 'Marketing templates'],
    benefits: ['A memorable, distinctive brand', 'Consistency across every channel', 'Greater trust and recognition', 'A strong foundation for marketing'],
    technologies: [],
    process: standardProcess,
    useCases: ['New brand creation', 'Rebranding', 'Brand guidelines', 'Marketing collateral'],
    faqs: [
      { question: 'Do you provide brand guidelines?', answer: 'Yes. We deliver clear brand guidelines so your team and partners apply the brand consistently.' },
    ],
    order: 14,
    featured: false,
  },
];
