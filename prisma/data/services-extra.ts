import type { ProcessStep, ServiceSeed } from './services';

/**
 * Additional service lines and per-service targeting (audience, industries, hero style).
 * Copy describes capabilities only: no client results, statistics, rankings or guarantees.
 * Technologies are limited to the stack Globalantic lists on its site (prisma/data/reference.ts).
 */

export interface ServiceExtras {
  heroVariant: string;
  audience: string[];
  industries: string[];
}

/** Hero style + who it is for + relevant industries, keyed by service slug. */
export const serviceExtras: Record<string, ServiceExtras> = {
  'web-development': { heroVariant: 'browser', audience: ['Startups launching a first website', 'SMBs replacing an outdated site', 'Agencies needing a development partner'], industries: ['real-estate', 'healthcare', 'education', 'hospitality', 'travel-tourism'] },
  'web-application-development': { heroVariant: 'webapp', audience: ['Founders building a SaaS or portal', 'Teams replacing spreadsheets with a web app', 'Businesses offering customer self-service'], industries: ['finance', 'education', 'logistics', 'healthcare'] },
  'software-development': { heroVariant: 'dashboard', audience: ['Growing companies with unique workflows', 'Operations teams outgrowing off-the-shelf tools', 'Startups building a product'], industries: ['manufacturing', 'logistics', 'finance', 'healthcare'] },
  'mobile-app-development': { heroVariant: 'mobile', audience: ['Startups launching an app', 'Businesses adding a customer app', 'Teams needing a field or staff app'], industries: ['healthcare', 'education', 'ecommerce', 'hospitality'] },
  'ai-solutions': { heroVariant: 'workflow', audience: ['Teams with repetitive manual work', 'Support and sales teams', 'Businesses exploring AI features in their product'], industries: ['finance', 'ecommerce', 'education', 'logistics'] },
  'crm-development': { heroVariant: 'crm', audience: ['Sales teams tracking leads in spreadsheets', 'Service businesses managing customers', 'Companies needing a CRM that fits their process'], industries: ['real-estate', 'automobile', 'education', 'finance'] },
  'erp-development': { heroVariant: 'erp', audience: ['Manufacturers and distributors', 'Multi-branch businesses', 'Companies running operations across disconnected tools'], industries: ['manufacturing', 'logistics', 'ecommerce'] },
  'ecommerce-development': { heroVariant: 'commerce', audience: ['Brands starting to sell online', 'Retailers moving from marketplaces to their own store', 'B2B sellers needing online ordering'], industries: ['ecommerce', 'travel-tourism', 'hospitality'] },
  'ui-ux-design': { heroVariant: 'design', audience: ['Startups validating a product', 'Teams redesigning an existing product', 'Businesses needing a design system'], industries: ['education', 'healthcare', 'finance', 'ecommerce'] },
  'api-integration': { heroVariant: 'api', audience: ['Businesses connecting separate tools', 'Teams automating data entry between systems', 'Products that need a public or partner API'], industries: ['ecommerce', 'logistics', 'finance', 'healthcare'] },
  'cloud-services': { heroVariant: 'cloud', audience: ['Teams moving off shared hosting', 'Products preparing to scale', 'Businesses needing reliable deployments and backups'], industries: ['finance', 'healthcare', 'logistics', 'education'] },
  'website-maintenance': { heroVariant: 'maintenance', audience: ['Businesses without an in-house developer', 'Teams with an existing site that needs care', 'Companies that need regular content and security updates'], industries: ['real-estate', 'healthcare', 'education', 'hospitality'] },
  seo: { heroVariant: 'search', audience: ['Businesses relying on organic enquiries', 'New websites that need a search foundation', 'Sites that lost visibility after a redesign'], industries: ['real-estate', 'healthcare', 'travel-tourism', 'ecommerce'] },
  aeo: { heroVariant: 'answers', audience: ['Businesses whose customers ask questions before buying', 'Service companies with FAQs and comparisons', 'Content teams publishing guides'], industries: ['healthcare', 'education', 'finance', 'real-estate'] },
  geo: { heroVariant: 'generative', audience: ['Brands that want to be described accurately by AI assistants', 'B2B companies with complex offerings', 'Businesses with thin or inconsistent web information'], industries: ['finance', 'education', 'healthcare', 'ecommerce'] },
  'digital-marketing': { heroVariant: 'marketing', audience: ['Businesses that need a steady flow of enquiries', 'Brands launching a product or service', 'Teams without an in-house marketer'], industries: ['ecommerce', 'real-estate', 'education', 'automobile'] },
  'social-media-marketing': { heroVariant: 'social', audience: ['Local businesses building awareness', 'Brands that need consistent content', 'Teams starting on new platforms'], industries: ['hospitality', 'ecommerce', 'education', 'travel-tourism'] },
  'google-meta-ads': { heroVariant: 'ads', audience: ['Businesses ready to advertise', 'Brands running seasonal campaigns', 'Teams wanting measurable lead generation'], industries: ['ecommerce', 'real-estate', 'education', 'automobile'] },
  branding: { heroVariant: 'brand', audience: ['New businesses before launch', 'Companies refreshing an outdated identity', 'Startups preparing for investors or customers'], industries: ['hospitality', 'ecommerce', 'education', 'finance'] },
};

const buildProcess: ProcessStep[] = [
  { title: 'Discovery', description: 'We understand your goals, users, current systems and constraints, and agree the scope.' },
  { title: 'Plan & design', description: 'We map the data, flows and screens and confirm them with you before building.' },
  { title: 'Build in iterations', description: 'We develop in short cycles with regular demos so you see progress early.' },
  { title: 'Test & secure', description: 'We test functionality, permissions, performance and edge cases before release.' },
  { title: 'Launch', description: 'We deploy with monitoring and backups and support your team through go-live.' },
  { title: 'Support & improve', description: 'We fix issues, add features and help the system grow with your business.' },
];

const visibilityProcess: ProcessStep[] = [
  { title: 'Audit', description: 'We review how your site and content are currently found, read and understood.' },
  { title: 'Priorities', description: 'We agree a short list of changes with the biggest expected impact for your goals.' },
  { title: 'Implement', description: 'We fix technical issues and improve structure, content and markup.' },
  { title: 'Publish', description: 'We help you publish clear, useful content that answers real customer questions.' },
  { title: 'Measure', description: 'We track what can be measured (indexing, search queries, traffic, enquiries) and report it honestly.' },
  { title: 'Iterate', description: 'We refine based on what the data shows. No ranking or citation is ever guaranteed.' },
];

export const extraServices: ServiceSeed[] = [
  {
    slug: 'web-application-development',
    title: 'Web Application Development',
    tagline: 'Browser-based software for your customers and your team',
    icon: 'AppWindow',
    shortDesc: 'Custom web applications, portals and SaaS products with secure accounts, roles and dashboards.',
    overview:
      'A web application does work, not just show information: customers log in, place orders, book, upload or track; staff manage records and approvals. We design and build web applications with secure authentication, role-based access, clear dashboards and APIs, so the product can grow feature by feature.',
    problem:
      'Teams run critical processes in spreadsheets, email threads and disconnected tools. Customers wait for manual replies because there is no self-service portal, and every new requirement makes the workaround more fragile.',
    solution:
      'We turn the process into a focused web application: the right data model, permissions for each role, automated notifications and an interface people actually use — built on a maintainable stack and delivered in iterations.',
    features: ['User accounts, roles and permissions', 'Dashboards and reporting', 'Customer self-service portals', 'Workflow automation and notifications', 'File uploads and document handling', 'Payments and third-party integrations'],
    deliverables: ['Working web application in production', 'Admin panel for your team', 'Source code and technical documentation', 'Deployment, backups and monitoring setup', 'Handover session for your team'],
    benefits: ['Replaces manual, error-prone processes', 'One source of truth for your data', 'Customers serve themselves at any time', 'A foundation you can extend later'],
    technologies: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL'],
    process: buildProcess,
    useCases: ['Customer and partner portals', 'SaaS products', 'Booking and order management', 'Internal approval and operations tools'],
    faqs: [
      { question: 'What is the difference between a website and a web application?', answer: 'A website mainly presents information. A web application lets users sign in and do things — manage records, place orders, track requests — with data stored securely on a server.' },
      { question: 'Can you start with a smaller first version?', answer: 'Yes. We usually agree a first release with the essential features, launch it, and add more based on real usage.' },
      { question: 'Who owns the code?', answer: 'You do. We hand over the source code and documentation as part of the project.' },
    ],
    order: 2,
    featured: false,
  },
  {
    slug: 'api-integration',
    title: 'API Development & Integration',
    tagline: 'Connect your systems so data flows without copy-and-paste',
    icon: 'Plug',
    shortDesc: 'Secure APIs and integrations between your website, apps, payment providers and business tools.',
    overview:
      'Most businesses run several tools that do not talk to each other. We build secure REST APIs for your products and integrate third-party services — payments, messaging, CRMs and internal systems — so information moves automatically and reliably.',
    problem:
      'Staff re-type the same data into several systems, records drift out of sync, and customers see outdated information because tools are not connected.',
    solution:
      'We design clear, documented APIs and dependable integrations with validation, error handling, retries and logging, so connected systems stay consistent and failures are visible instead of silent.',
    features: ['REST API design and development', 'Third-party API integrations', 'Payment gateway integration', 'Webhooks with signature verification', 'Authentication and access control', 'API documentation'],
    deliverables: ['Documented API or integration', 'Automated tests for key flows', 'Error handling, retries and logging', 'Deployment and configuration guide'],
    benefits: ['Less manual data entry', 'Consistent data across tools', 'Faster processes for staff and customers', 'Integrations you can monitor'],
    technologies: ['Node.js', 'Express.js', 'TypeScript', 'PostgreSQL', 'PHP', 'Laravel'],
    process: buildProcess,
    useCases: ['Website-to-CRM lead sync', 'Payment and invoicing integration', 'Mobile app backends', 'Partner and supplier data exchange'],
    faqs: [
      { question: 'Can you integrate a tool that has an API?', answer: 'Usually, yes. We review the provider’s API documentation and limits first and confirm what is possible before committing to a scope.' },
      { question: 'How do you keep integrations secure?', answer: 'Credentials stay on the server, requests are authenticated and validated, webhooks are signature-checked, and sensitive data is not logged.' },
    ],
    order: 9,
    featured: false,
  },
  {
    slug: 'website-maintenance',
    title: 'Website Maintenance & Support',
    tagline: 'Keep your website secure, up to date and working',
    icon: 'Wrench',
    shortDesc: 'Ongoing updates, fixes, backups, security patches and content changes for existing websites and apps.',
    overview:
      'A website needs regular care after launch: software updates, security patches, backups, fixes and content changes. We maintain websites and web applications so your team can focus on the business while the site stays dependable.',
    problem:
      'Without regular maintenance, plugins and dependencies fall behind, security issues go unpatched, small bugs pile up and simple content updates wait for someone to find time.',
    solution:
      'We take care of updates, backups, monitoring and fixes on an agreed schedule, and handle your change requests through a simple process — with a clear record of what was done.',
    features: ['Software, plugin and dependency updates', 'Security patches and hardening', 'Backups and restore checks', 'Uptime and error monitoring setup', 'Bug fixes and small improvements', 'Content and page updates'],
    deliverables: ['Agreed maintenance schedule', 'Backup and update records', 'Change log of work done', 'Recommendations for improvements'],
    benefits: ['Fewer surprises and outages', 'Reduced security risk', 'Changes handled by people who know the code', 'Predictable support'],
    technologies: ['WordPress', 'Next.js', 'React', 'PHP', 'Laravel', 'Node.js'],
    process: [
      { title: 'Site review', description: 'We review the code, hosting, access and current issues of your site.' },
      { title: 'Stabilise', description: 'We apply urgent updates and fixes and set up backups and monitoring.' },
      { title: 'Agree a plan', description: 'We agree what is maintained, how often and how you request changes.' },
      { title: 'Maintain', description: 'We carry out scheduled updates, checks and requested changes.' },
      { title: 'Report', description: 'We share a record of the work and anything that needs your decision.' },
    ],
    useCases: ['Business websites without an in-house developer', 'WordPress sites that need regular updates', 'Web apps after launch', 'Taking over a site from another provider'],
    faqs: [
      { question: 'Can you maintain a website you did not build?', answer: 'Often, yes. We first review the code and hosting to confirm we can maintain it safely.' },
      { question: 'What if something breaks?', answer: 'We investigate, fix the issue and restore from backups if needed. Response times are agreed in the maintenance plan.' },
    ],
    order: 13,
    featured: false,
  },
  {
    slug: 'aeo',
    title: 'AEO — Answer Engine Optimization',
    tagline: 'Clear answers that search features and assistants can understand',
    icon: 'MessageSquareText',
    shortDesc: 'Structure your content to answer real customer questions clearly — for search features, voice and AI assistants.',
    overview:
      'Answer Engine Optimization (AEO) focuses on the questions your customers ask and makes sure your website answers them clearly. We research those questions, write and structure direct answers, and apply valid structured data where it is eligible, so search features and assistants can understand your content.',
    problem:
      'Customers ask specific questions before they enquire, but many websites bury the answers in long pages, use vague headings or never answer them at all — so the information is hard for people and machines to find.',
    solution:
      'We identify the questions that matter, answer them concisely near the top of relevant pages, organise content with descriptive headings and FAQs, and keep the information accurate and consistent across your site.',
    features: ['Customer question research', 'Concise, direct answer writing', 'FAQ sections and content structure', 'Descriptive headings and summaries', 'Valid structured data where eligible', 'Consistency checks across pages'],
    deliverables: ['Question and topic map', 'Rewritten or new answer content', 'FAQ and heading structure', 'Structured data implementation', 'Recommendations for ongoing content'],
    benefits: ['Customers find answers faster', 'Clearer content for search features and assistants', 'Fewer repetitive pre-sales questions', 'Content that supports your SEO'],
    technologies: ['Next.js', 'React', 'WordPress'],
    process: visibilityProcess,
    useCases: ['Service FAQs and comparisons', 'How-to and guide content', 'Pricing and process explanations', 'Local service questions'],
    faqs: [
      { question: 'Is AEO different from SEO?', answer: 'AEO builds on SEO. SEO helps pages get found and ranked; AEO focuses on answering specific questions clearly so they can be understood and surfaced as answers.' },
      { question: 'Can you guarantee featured snippets or assistant answers?', answer: 'No. Search engines and assistants decide what they show. We improve the clarity, structure and accuracy of your content, which is what those systems rely on.' },
      { question: 'Do you add FAQ structured data?', answer: 'Only where the content is a genuine FAQ visible on the page and the markup is valid under current guidelines. Some rich-result types are limited to certain sites, so we do not promise rich results.' },
    ],
    order: 15,
    featured: false,
  },
  {
    slug: 'geo',
    title: 'GEO — Generative Engine Optimization',
    tagline: 'Help AI assistants describe your business accurately',
    icon: 'Sparkles',
    shortDesc: 'Make your company and services clear, consistent and well-documented for AI-generated answers.',
    overview:
      'Generative Engine Optimization (GEO) prepares your online information for AI assistants and AI-powered search that summarise the web. We make your company, services and expertise clear, consistent and crawlable, with factual, original content and correct structured data — so these systems have accurate material to work from.',
    problem:
      'AI assistants summarise what they can find. When a business has thin, inconsistent or outdated information, those summaries may be vague, incomplete or simply leave the business out.',
    solution:
      'We strengthen the factual foundation: clear company and service descriptions, consistent business details, in-depth original content on your topics, descriptive internal links and correct Organization and Service markup — all accessible to crawlers.',
    features: ['Entity and brand information review', 'Consistent company and service descriptions', 'Topical content planning', 'Original, factual content development', 'Organization and Service structured data', 'Crawlability and internal linking'],
    deliverables: ['GEO readiness review', 'Company and service fact sheet for your site', 'Content plan and new content', 'Structured data and crawlability fixes', 'Guidelines for consistent information'],
    benefits: ['More accurate descriptions of your business', 'Consistent information across channels', 'Content that also supports SEO and AEO', 'A clearer story for customers'],
    technologies: ['Next.js', 'React', 'WordPress'],
    process: visibilityProcess,
    useCases: ['B2B and technical services', 'Companies with complex offerings', 'New brands building an online footprint', 'Businesses with inconsistent listings'],
    faqs: [
      { question: 'Can GEO guarantee that AI assistants mention my business?', answer: 'No. AI systems decide what to include. GEO improves the accuracy, consistency and depth of the information available about you, which those systems draw on.' },
      { question: 'How is GEO measured?', answer: 'Directly measuring AI answers is still limited. We track what is measurable — crawlability, indexing, structured data validity, referral traffic and enquiries — and can review sample assistant answers for accuracy.' },
    ],
    order: 16,
    featured: false,
  },
];
