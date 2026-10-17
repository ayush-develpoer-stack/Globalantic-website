export interface IndustrySeed {
  slug: string;
  title: string;
  tagline: string;
  icon: string;
  shortDesc: string;
  overview: string;
  challenges: string[];
  solutions: string[];
  relevantServices: string[];
  features: string[];
  technologies: string[];
  useCases: string[];
  faqs: { question: string; answer: string }[];
  order: number;
}

function build(
  slug: string,
  title: string,
  icon: string,
  shortDesc: string,
  overview: string,
  challenges: string[],
  solutions: string[],
  relevantServices: string[],
  useCases: string[],
  order: number,
): IndustrySeed {
  return {
    slug,
    title,
    tagline: `Digital solutions for the ${title.toLowerCase()} sector`,
    icon,
    shortDesc,
    overview,
    challenges,
    solutions,
    relevantServices,
    features: solutions.slice(0, 4),
    technologies: ['React', 'Next.js', 'Node.js', 'PostgreSQL'],
    useCases,
    faqs: [
      {
        question: `Do you build custom software for ${title.toLowerCase()}?`,
        answer:
          'Yes. We design and build custom digital solutions tailored to the specific workflows and requirements of your sector.',
      },
    ],
    order,
  };
}

export const industries: IndustrySeed[] = [
  build(
    'healthcare',
    'Healthcare',
    'HeartPulse',
    'Secure, patient-focused digital solutions for clinics, hospitals and health services.',
    'We help healthcare providers digitize operations and improve patient experience with secure, reliable systems — from appointment booking to patient management and telehealth.',
    ['Manual appointment and record management', 'Fragmented patient data', 'Long wait times', 'Compliance and data security'],
    ['Appointment & booking systems', 'Patient management platforms', 'Telehealth integrations', 'Secure data handling'],
    ['web-development', 'software-development', 'mobile-app-development', 'cloud-services'],
    ['Clinic management', 'Online appointment booking', 'Patient portals', 'Health service websites'],
    1,
  ),
  build(
    'education',
    'Education',
    'GraduationCap',
    'Learning platforms and management systems for institutes and educators.',
    'We build digital platforms for schools, institutes and educators — from learning management systems to admissions and student management portals.',
    ['Manual admissions and records', 'Limited online learning', 'Poor student engagement', 'Disconnected systems'],
    ['Learning management systems', 'Student & admissions portals', 'Online course delivery', 'Engagement tools'],
    ['software-development', 'web-development', 'ui-ux-design', 'cloud-services'],
    ['Online courses', 'Student portals', 'Institute websites', 'Admissions systems'],
    2,
  ),
  build(
    'real-estate',
    'Real Estate',
    'Building',
    'Property portals, listings and CRM for real estate businesses.',
    'We help real estate businesses attract and manage leads with modern property portals, listing platforms and CRMs tailored to how agents work.',
    ['Managing large property listings', 'Lead capture and follow-up', 'Manual client management', 'Standing out online'],
    ['Property listing portals', 'Real estate CRM', 'Lead capture forms', 'Virtual tour integration'],
    ['web-development', 'crm-development', 'digital-marketing', 'seo'],
    ['Property portals', 'Agent CRMs', 'Listing websites', 'Lead generation'],
    3,
  ),
  build(
    'ecommerce',
    'E-commerce & Retail',
    'ShoppingBag',
    'Online stores and retail systems built to sell and scale.',
    'We build e-commerce stores and retail systems — from storefronts and checkout to inventory and order management — designed to convert and scale.',
    ['Slow, hard-to-manage stores', 'Inventory and order chaos', 'Low conversion rates', 'Scaling during peaks'],
    ['E-commerce storefronts', 'Inventory & order management', 'Payment integration', 'Performance optimization'],
    ['ecommerce-development', 'web-development', 'digital-marketing', 'seo'],
    ['Online stores', 'Retail management', 'Marketplaces', 'D2C brands'],
    4,
  ),
  build(
    'finance',
    'Finance & Fintech',
    'Landmark',
    'Secure platforms and dashboards for financial services.',
    'We build secure, reliable digital solutions for financial services — dashboards, portals and internal tools with a strong focus on security and data integrity.',
    ['Strict security requirements', 'Complex data and reporting', 'Manual processes', 'Legacy systems'],
    ['Secure web platforms', 'Financial dashboards', 'Process automation', 'System integrations'],
    ['software-development', 'web-development', 'cloud-services', 'ai-solutions'],
    ['Client portals', 'Financial dashboards', 'Internal tools', 'Reporting systems'],
    5,
  ),
  build(
    'travel-tourism',
    'Travel & Tourism',
    'Plane',
    'Booking platforms and websites for travel businesses.',
    'We build booking platforms, travel websites and management systems that help travel businesses attract customers and manage bookings smoothly.',
    ['Complex booking flows', 'Managing availability', 'Seasonal demand spikes', 'Online visibility'],
    ['Booking platforms', 'Travel websites', 'Availability management', 'Payment integration'],
    ['web-development', 'ecommerce-development', 'digital-marketing', 'seo'],
    ['Booking websites', 'Tour operators', 'Travel agencies', 'Hotel booking'],
    6,
  ),
  build(
    'hospitality',
    'Hospitality',
    'UtensilsCrossed',
    'Digital systems for hotels, restaurants and hospitality brands.',
    'We help hospitality businesses improve guest experience and operations with booking systems, ordering platforms and management tools.',
    ['Manual reservations', 'Guest experience gaps', 'Order and table management', 'Online presence'],
    ['Reservation systems', 'Online ordering', 'Management dashboards', 'Branded websites'],
    ['web-development', 'software-development', 'ui-ux-design', 'digital-marketing'],
    ['Hotel booking', 'Restaurant ordering', 'Reservation systems', 'Hospitality websites'],
    7,
  ),
  build(
    'manufacturing',
    'Manufacturing',
    'Factory',
    'ERP and operations systems for manufacturers.',
    'We build ERP and operations systems that connect production, inventory and supply chain — giving manufacturers real-time visibility and control.',
    ['Disconnected systems', 'Inventory and production tracking', 'Manual reporting', 'Supply chain visibility'],
    ['ERP systems', 'Inventory management', 'Production tracking', 'Operations dashboards'],
    ['erp-development', 'software-development', 'cloud-services', 'ai-solutions'],
    ['ERP platforms', 'Inventory systems', 'Production tracking', 'Operations tools'],
    8,
  ),
  build(
    'logistics',
    'Logistics & Supply Chain',
    'Truck',
    'Tracking and management systems for logistics operations.',
    'We build logistics platforms that streamline tracking, dispatch and fleet management — improving visibility and efficiency across your supply chain.',
    ['Manual tracking', 'Route and dispatch inefficiency', 'Fragmented data', 'Real-time visibility'],
    ['Tracking systems', 'Dispatch management', 'Fleet dashboards', 'Integrations'],
    ['software-development', 'web-development', 'cloud-services', 'ai-solutions'],
    ['Shipment tracking', 'Fleet management', 'Dispatch systems', 'Logistics dashboards'],
    9,
  ),
  build(
    'automobile',
    'Automobile',
    'Car',
    'Digital platforms for dealerships and automotive businesses.',
    'We build websites, booking systems and management tools for dealerships, service centers and automotive businesses.',
    ['Managing inventory and listings', 'Service booking', 'Lead management', 'Online presence'],
    ['Vehicle listing portals', 'Service booking systems', 'Automotive CRM', 'Branded websites'],
    ['web-development', 'crm-development', 'digital-marketing', 'seo'],
    ['Dealership websites', 'Service booking', 'Inventory portals', 'Lead generation'],
    10,
  ),
  build(
    'professional-services',
    'Professional Services',
    'Briefcase',
    'Websites and tools for consultancies, agencies and firms.',
    'We help professional services firms present their expertise and streamline operations with polished websites, client portals and internal tools.',
    ['Outdated online presence', 'Manual client management', 'Scattered documents', 'Lead generation'],
    ['Professional websites', 'Client portals', 'CRM & internal tools', 'Lead capture'],
    ['web-development', 'crm-development', 'ui-ux-design', 'seo'],
    ['Firm websites', 'Client portals', 'Consultancy tools', 'Lead generation'],
    11,
  ),
  build(
    'startups-saas',
    'Startups & SaaS',
    'Rocket',
    'MVPs and scalable products for startups and SaaS founders.',
    'We partner with startups and SaaS founders to build MVPs and scalable products — moving fast from idea to launch and growing with you.',
    ['Moving fast from idea to MVP', 'Limited engineering resources', 'Scaling architecture', 'Iterating on feedback'],
    ['MVP development', 'Custom SaaS platforms', 'Scalable architecture', 'Ongoing iteration'],
    ['software-development', 'web-development', 'ai-solutions', 'cloud-services'],
    ['MVPs', 'SaaS products', 'Web platforms', 'Product iteration'],
    12,
  ),
];
