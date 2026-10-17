/**
 * Globalantic's real client projects (owner confirmed 2026-10-17 that all eight are Globalantic work).
 *
 * Every feature below was checked on the live public site on 2026-10-17 (see
 * docs/PORTFOLIO_IMPLEMENTATION_REPORT.md). Deliberately NOT included: client traffic, rankings,
 * revenue, ratings, review counts, "customers served" figures, investment returns or regulatory
 * claims — those belong to the clients and were not verified by Globalantic.
 *
 * `client` is stored but stays hidden publicly until staff tick "client approved" in the admin.
 * Related projects are grouped by `industry` (same organisation = same industry here).
 * Images are intentionally empty: the site shows a category placeholder until real screenshots
 * are uploaded in Admin -> Website -> Projects.
 */
export interface RealProject {
  slug: string;
  title: string;
  category: string;
  industry: string;
  client: string;
  shortDescription: string;
  description: string;
  requirement?: string;
  solution?: string;
  features: string[];
  technologies: string[];
  services: string[];
  links: { label: string; url: string }[];
  order: number;
  featured?: boolean;
  seoTitle: string;
  seoDescription: string;
}

export const realProjects: RealProject[] = [
  {
    slug: 'maharaj-tours-and-travels-website',
    title: 'Maharaj Tours & Travels — Travel Website',
    category: 'Travel & Tourism Website',
    industry: 'Travel & Tourism',
    client: 'Maharaj Tours & Travels',
    shortDescription: 'Website for a Bhopal taxi, car rental and tour operator: fleet with per-km rates, tour and temple packages, and quick booking enquiries by form, call or WhatsApp.',
    description:
      'Maharaj Tours & Travels is a taxi, car rental and tour service based in Bhopal, Madhya Pradesh. Globalantic built its main website to present the full range of services — local cab booking, airport pickup and drop, outstation trips, Madhya Pradesh and India tour packages, temple and pilgrimage tours, and wedding and event cars — and to turn visitors into booking enquiries.\n\nThe site lists the fleet with per-kilometre rates, groups cars by type, and presents destination and temple tours with starting prices. Every page leads to a booking action: a quick booking form, "Book Now" buttons, click-to-call and WhatsApp chat, plus a contact form with service selection.',
    requirement: 'A single place for customers to see vehicles, rates and tour packages, and to send a booking request in a few taps from a phone.',
    solution: 'A responsive multi-section website with fleet, services, destinations, tours, blog, about and contact pages, and booking calls-to-action (form, call, WhatsApp) throughout.',
    features: [
      'Fleet listing with per-km rates and car-type browsing (coupe, sedan, SUV)',
      'Tour and temple-tour packages with starting prices',
      'Quick booking form: name, phone, travel type, pickup, dates and vehicle',
      'Click-to-call and WhatsApp booking/chat buttons',
      'Contact form with service selection',
      'Blog / latest articles section',
      'Mobile-first responsive layout',
    ],
    technologies: [],
    services: ['web-development', 'ui-ux-design'],
    links: [{ label: 'Visit live site', url: 'https://maharajtourandtravels.com/' }],
    order: 10,
    featured: true,
    seoTitle: 'Maharaj Tours & Travels Website — Travel & Taxi Booking | Globalantic Portfolio',
    seoDescription: 'Travel and taxi booking website built by Globalantic for Maharaj Tours & Travels, Bhopal: fleet with per-km rates, tour packages and WhatsApp booking enquiries.',
  },
  {
    slug: 'maharaj-car-rental-bhopal-landing-page',
    title: 'Maharaj Car Rental Bhopal — Lead Generation Landing Page',
    category: 'Car Rental & Lead Generation',
    industry: 'Travel & Tourism',
    client: 'Maharaj Tours & Travels',
    shortDescription: 'A dedicated car-rental landing page within the Maharaj Tours & Travels website, built to capture taxi and outstation booking enquiries in Bhopal.',
    description:
      'A focused landing page that sits inside the Maharaj Tours & Travels website (at /car-rental-bhopal/) and concentrates on one goal: booking enquiries for taxis and car rental in Bhopal.\n\nIt presents clear price points for local taxi, airport drop, outstation and round trips, the available vehicles, and popular outstation routes from Bhopal, followed by a "why choose us" section, FAQs and a quick booking form. Booking is one tap away throughout, with click-to-call buttons, WhatsApp links with pre-filled messages, a vehicle price selector and a floating "Need a cab?" WhatsApp button.',
    requirement: 'A single-purpose page for car-rental campaigns that gets visitors to call, WhatsApp or submit a booking request quickly.',
    solution: 'A conversion-focused landing page with pricing packages, fleet, routes, FAQ and multiple contact paths, kept separate from the main site so it can be used for campaigns.',
    features: [
      'Price packages for local, airport, outstation and round trips',
      'Fleet section and instant price selector',
      'Popular outstation routes from Bhopal with custom quotes',
      'Quick booking form: name, phone, pickup, drop, date and vehicle',
      'WhatsApp links with pre-filled booking messages and a floating WhatsApp button',
      'Click-to-call buttons and an FAQ section',
      'Service areas across Bhopal',
    ],
    technologies: [],
    services: ['web-development', 'digital-marketing'],
    links: [{ label: 'Visit landing page', url: 'https://maharajtourandtravels.com/car-rental-bhopal/index.html' }],
    order: 20,
    seoTitle: 'Car Rental Landing Page for Maharaj Tours & Travels | Globalantic Portfolio',
    seoDescription: 'Lead-generation landing page for car rental in Bhopal built by Globalantic: price packages, fleet, outstation routes and one-tap WhatsApp and call booking.',
  },
  {
    slug: 'ideal-hair-website',
    title: 'Ideal Hair — Business Website & Online Store',
    category: 'Business Website',
    industry: 'Beauty & Personal Care',
    client: 'Ideal Hair',
    shortDescription: 'Website and online shop for a Bhopal hair and beauty business: product catalogue with cart, services, gallery, customer accounts and WhatsApp contact.',
    description:
      'Ideal Hair is a hair and beauty business in Bhopal offering wigs, hair extensions, hair care and styling products alongside salon-style services. The website combines an online shop with a showcase of the business\'s services.\n\nVisitors can browse products by category (wigs, extensions, hair care, styling, colour and beauty products), add items to a cart, and register or log in. Service pages cover extensions, wig styling and consultation, styling, treatments, colouring and beauty services, with a gallery, an academics section, and a consultation call-to-action. Customers can reach the business by WhatsApp or phone, and sign up to the newsletter.',
    features: [
      'Product catalogue with category filters, ratings and add-to-cart',
      'Customer login and registration',
      'Services pages and "Book a Consultation" call-to-action',
      'Gallery and academics sections',
      'WhatsApp chat and click-to-call',
      'Newsletter signup',
      'Privacy policy and terms pages',
    ],
    technologies: [],
    services: ['web-development', 'ecommerce-development'],
    links: [{ label: 'Visit live site', url: 'https://idealhair.in/' }],
    order: 30,
    seoTitle: 'Ideal Hair Website & Online Store | Globalantic Portfolio',
    seoDescription: 'Business website and online store built by Globalantic for Ideal Hair, Bhopal: product catalogue with cart, customer accounts, services and WhatsApp contact.',
  },
  {
    slug: 'news-sukh-dukh-news-platform',
    title: 'News Sukh Dukh — Hindi News Platform',
    category: 'News & Publishing Platform',
    industry: 'News & Media',
    client: 'Newssukhdukh',
    shortDescription: 'A Hindi news website with category navigation, article pages, curated sections, search and editorial policy pages, built on Next.js.',
    description:
      'Newssukhdukh is a Hindi-language general news website. Globalantic built it as a publishing platform that keeps a large number of stories easy to browse on a phone.\n\nNews is organised into sections — world, politics, business, sports, entertainment and health — plus a wider set of categories such as Bhopal news, state news, education, government schemes, technology, religion and weather. Article cards show the thumbnail, category, headline, summary, author, publish time and reading time, with "Updated" and "Breaking News" labels where relevant. Curated blocks (Trending, Most Popular, Editor\'s picks, Most Read, News Roundup), search, newsletter signup and published editorial, fact-check and corrections policies round out the reader experience.',
    features: [
      'Category and sub-category navigation, including local Bhopal and state news',
      'Article cards with author, publish time and reading time',
      '"Updated" and "Breaking News" labels',
      'Curated sections: Trending, Most Popular, Editor\'s picks, Most Read',
      'Search page and newsletter signup',
      'Editorial, fact-check and corrections policy pages',
      'Optimised images served through Next.js image handling and Cloudinary',
    ],
    technologies: ['Next.js', 'Cloudinary'],
    services: ['web-development', 'seo'],
    links: [{ label: 'Visit live site', url: 'https://newssukhdukh.in/' }],
    order: 40,
    featured: true,
    seoTitle: 'News Sukh Dukh — Hindi News Platform | Globalantic Portfolio',
    seoDescription: 'Hindi news publishing platform built by Globalantic on Next.js: category navigation, article pages, curated sections, search and editorial policy pages.',
  },
  {
    slug: 'nakul-pathology-lab-crm',
    title: 'Nakul Pathology Lab — CRM Application',
    category: 'Healthcare CRM / Business Software',
    industry: 'Healthcare',
    client: 'Nakul Pathology Lab',
    shortDescription: 'A private, login-protected CRM web application built for Nakul Pathology Lab\'s internal operations.',
    description:
      'A private, login-protected CRM web application built for Nakul Pathology Lab\'s internal operations. It is used by the lab\'s staff and is not publicly accessible, so its screens and data are not shown here.\n\nIt complements the lab\'s public website, which Globalantic also built (see the related project below).',
    features: [],
    technologies: [],
    services: ['crm-development', 'software-development'],
    links: [{ label: 'Application sign-in page', url: 'https://crm.nakulpathologylab.in/' }],
    order: 50,
    seoTitle: 'Nakul Pathology Lab CRM Application | Globalantic Portfolio',
    seoDescription: 'Private CRM web application built by Globalantic for Nakul Pathology Lab\'s internal operations.',
  },
  {
    slug: 'nakul-pathology-lab-website',
    title: 'Nakul Pathology Lab — Healthcare Website',
    category: 'Healthcare Website',
    industry: 'Healthcare',
    client: 'Nakul Pathology Lab',
    shortDescription: 'Patient-facing website for a Bhopal diagnostic lab: test and package listings, online appointment booking with home sample collection, and online report access.',
    description:
      'Nakul Pathology Lab & Health Care Center is a diagnostic lab in Bhopal. Its public website helps patients find tests, book appointments and get their reports without a visit.\n\nPatients can browse popular pathology tests and health checkup packages, book an appointment at the lab or choose home sample collection, and check and download reports online using a report ID and their registered mobile number. Test preparation notes, an FAQ, and call and WhatsApp contact options answer common questions. The lab\'s internal CRM, also built by Globalantic, is listed as a related project.',
    features: [
      'Pathology test and health package listings',
      'Online appointment booking, including home sample collection',
      'Online report access with report ID and registered mobile number',
      'Test preparation information (e.g. fasting requirements)',
      'FAQ section',
      'Call and WhatsApp contact',
    ],
    technologies: [],
    services: ['web-development', 'ui-ux-design'],
    links: [{ label: 'Visit live site', url: 'https://nakulpathologylab.in/' }],
    order: 60,
    seoTitle: 'Nakul Pathology Lab Website — Healthcare | Globalantic Portfolio',
    seoDescription: 'Healthcare website built by Globalantic for Nakul Pathology Lab, Bhopal: test listings, online booking with home sample collection, and online report access.',
  },
  {
    slug: 'nexgen-technologies-website',
    title: 'Nexgen Technologies — IT Services Website',
    category: 'IT & Digital Solutions Website',
    industry: 'IT Services',
    client: 'Nexgen Technologies',
    shortDescription: 'Corporate website for a Bhopal software company, structured around services, solutions and industries, with portfolio, blog, contact and quote pages.',
    description:
      'Nexgen Technologies is a software development company in Bhopal. Its website presents a broad offer clearly: services are grouped into "Build" (websites, web and mobile apps, software, UI/UX, ERP) and "Grow & Support" (CRM, cloud, AI, SEO, digital marketing, maintenance), alongside packaged solutions and the industries served.\n\nThe homepage walks visitors through the company, its services, industries, delivery process and technologies, then into portfolio highlights and the latest blog posts. Consultation and quote calls-to-action lead to dedicated contact and "Start Project" quote pages, and the footer carries a newsletter subscription and policy pages.',
    features: [
      'Service catalogue grouped into Build and Grow & Support',
      'Solutions and industries sections',
      'Delivery process and technologies overview',
      'Portfolio highlights and blog',
      'Contact page and dedicated quote ("Start Project") page',
      'Newsletter subscription and policy pages',
    ],
    technologies: [],
    services: ['web-development', 'ui-ux-design'],
    links: [{ label: 'Visit live site', url: 'https://nexgentechnologie.com/' }],
    order: 70,
    seoTitle: 'Nexgen Technologies Website — IT Services | Globalantic Portfolio',
    seoDescription: 'IT services company website built by Globalantic for Nexgen Technologies, Bhopal: services, solutions and industries, portfolio, blog and quote request pages.',
  },
  {
    slug: 'investor-goal-website',
    title: 'Investor Goal — Financial Advisory Website',
    category: 'Financial / Business Website',
    industry: 'Financial Services',
    client: 'Investor Goal',
    shortDescription: 'Website for a Bhopal mutual fund and LIC advisory business: service pages, an SIP calculator, consultation and callback forms, and a blog.',
    description:
      'Investor Goal is a financial advisory business in Bhopal working with mutual funds, stock market investing, SIP planning and LIC and health insurance. Globalantic designed and developed its website to explain these services and make it easy for visitors to ask for advice.\n\nThe site includes pages for mutual funds, the stock market and LIC insurance, an interactive SIP calculator, a link to a risk-profiling quiz, an investment enquiry form and an advisor callback form, a blog, an FAQ, and WhatsApp and social links. Market-risk disclaimers are shown on the site.',
    features: [
      'Service pages for mutual funds, stock market and LIC insurance',
      'Interactive SIP calculator',
      'Investment enquiry form and advisor callback form',
      'Risk-profiling quiz link',
      'Blog and FAQ',
      'WhatsApp and social links',
    ],
    technologies: [],
    services: ['web-development'],
    links: [{ label: 'Visit live site', url: 'https://investorgoal.in/' }],
    order: 80,
    seoTitle: 'Investor Goal Website — Financial Advisory | Globalantic Portfolio',
    seoDescription: 'Financial advisory website built by Globalantic for Investor Goal, Bhopal: service pages, SIP calculator, consultation and callback forms, and a blog.',
  },
];
