import type {
  CareerApplication,
  CareerStatus,
  ContactLead,
  ContactStatus,
  NewsletterSubscriber,
  TrainingApplication,
  TrainingStatus,
} from '@/types';

/**
 * Fictional lead records for mock mode only. Names are invented, e-mail
 * addresses use the reserved example.com domain (RFC 2606) and phone numbers
 * use the 555 placeholder range — none of this is real customer data.
 * IDs and timestamps are fixed so renders are deterministic.
 */

const BASE = Date.UTC(2026, 9, 12, 10, 0, 0); // 2026-10-12T10:00:00Z
const HOUR = 60 * 60 * 1000;

/** Fixed timestamp `hoursAgo` hours before BASE. */
function at(hoursAgo: number): string {
  return new Date(BASE - hoursAgo * HOUR).toISOString();
}

function id(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

const CONTACT_ROWS: [string, string | null, string | null, string | null, ContactStatus, string][] = [
  ['Aarav Sharma', 'Northwind Retail', 'E-commerce Development', '₹5–10 lakh', 'NEW', 'We want to move our store online with inventory sync.'],
  ['Priya Nair', 'Lotus Clinics', 'Software Development', '₹10–25 lakh', 'CONTACTED', 'Looking for an appointment and patient records system.'],
  ['Rohan Mehta', null, 'Web Development', '₹1–5 lakh', 'NEW', 'Need a new website for my consultancy practice.'],
  ['Sneha Kulkarni', 'BrightPath Academy', 'Mobile App Development', '₹5–10 lakh', 'QUALIFIED', 'An app for students to view schedules and results.'],
  ['Vikram Rao', 'Rao Logistics', 'CRM Development', '₹10–25 lakh', 'IN_PROGRESS', 'We track leads in spreadsheets and want a proper CRM.'],
  ['Ananya Iyer', null, 'UI/UX Design', 'Under ₹1 lakh', 'CLOSED', 'Redesign of our onboarding screens.'],
  ['Kabir Singh', 'Greenleaf Foods', 'Digital Marketing', '₹1–5 lakh', 'NEW', 'Help with SEO and social campaigns for a product launch.'],
  ['Meera Joshi', 'Joshi & Co. Architects', 'Web Development', '₹1–5 lakh', 'CONVERTED', 'Portfolio website with a project gallery.'],
  ['Arjun Patel', 'Patel Hardware', 'ERP Development', '₹25 lakh+', 'CONTACTED', 'Inventory, billing and branch reporting in one system.'],
  ['Ishita Gupta', null, 'AI Solutions', null, 'NEW', 'Exploring an AI assistant for customer support queries.'],
  ['Nikhil Verma', 'UrbanNest Realty', 'Software Development', '₹5–10 lakh', 'QUALIFIED', 'Property listing management with an agent portal.'],
  ['Tanvi Deshpande', 'Deshpande Dental', 'Web Development', 'Under ₹1 lakh', 'NEW', 'Simple website with online appointment requests.'],
  ['Siddharth Menon', 'Menon Textiles', 'E-commerce Development', '₹10–25 lakh', 'IN_PROGRESS', 'B2B ordering portal for wholesale buyers.'],
  ['Kavya Reddy', null, 'Branding', '₹1–5 lakh', 'CLOSED', 'Logo and brand guidelines for a new cafe.'],
];

export const contactLeads: ContactLead[] = CONTACT_ROWS.map(([name, company, service, budget, status, message], i) => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
  return {
    id: id('contact', i + 1),
    name,
    email: `${slug}@example.com`,
    phone: i % 3 === 0 ? null : `+91 55500 ${String(10000 + i * 137).slice(0, 5)}`,
    company,
    service,
    budget,
    message,
    status,
    createdAt: at(i * 9 + 2),
    updatedAt: at(i * 9 + 1),
  };
});

const TRAINING_ROWS: [string, string, string | null, TrainingApplication['mode'], TrainingStatus, string | null][] = [
  ['Rahul Tiwari', 'Undergraduate', 'Bhopal', 'OFFLINE', 'NEW', 'Basics (HTML/CSS)'],
  ['Pooja Mishra', 'Graduate', 'Indore', 'ONLINE', 'CONTACTED', 'Some JavaScript'],
  ['Aditya Chauhan', '12th', 'Bhopal', 'OFFLINE', 'SHORTLISTED', 'None'],
  ['Neha Yadav', 'Diploma', 'Jabalpur', 'ONLINE', 'NEW', 'Basics (HTML/CSS)'],
  ['Harsh Saxena', 'Graduate', 'Bhopal', 'OFFLINE', 'JOINED', 'Built projects'],
  ['Simran Kaur', 'Undergraduate', 'Gwalior', 'ONLINE', 'REJECTED', 'None'],
  ['Manish Dubey', 'Freshers', 'Bhopal', 'OFFLINE', 'NEW', 'Some JavaScript'],
  ['Riya Agarwal', 'Graduate', null, 'ONLINE', 'CONTACTED', 'Built projects'],
  ['Kunal Jain', 'Undergraduate', 'Ujjain', 'ONLINE', 'COMPLETED', 'Some JavaScript'],
  ['Divya Pandey', 'Diploma', 'Bhopal', 'OFFLINE', 'SHORTLISTED', 'Basics (HTML/CSS)'],
  ['Saurabh Shukla', '12th', 'Sagar', 'ONLINE', 'NEW', 'None'],
  ['Ankita Soni', 'Graduate', 'Bhopal', 'OFFLINE', 'NEW', 'Basics (HTML/CSS)'],
];

export const trainingApplications: TrainingApplication[] = TRAINING_ROWS.map(
  ([fullName, qualification, city, mode, status, codingExperience], i) => {
    const slug = fullName.toLowerCase().replace(/[^a-z]+/g, '.');
    return {
      id: id('training', i + 1),
      fullName,
      phone: `+91 55501 ${String(20000 + i * 211).slice(0, 5)}`,
      whatsapp: i % 2 === 0 ? `+91 55501 ${String(20000 + i * 211).slice(0, 5)}` : null,
      email: `${slug}@example.com`,
      age: 18 + (i % 7),
      qualification,
      college: i % 3 === 0 ? null : 'Example Institute of Technology',
      city,
      mode,
      codingExperience,
      whyJoin: i % 2 === 0 ? 'I want hands-on project experience and a portfolio.' : null,
      preferredContactTime: i % 4 === 0 ? 'Evenings after 6 pm' : null,
      status,
      createdAt: at(i * 11 + 3),
      updatedAt: at(i * 11 + 2),
    };
  },
);

const CAREER_ROWS: [string, string, CareerStatus][] = [
  ['Aditi Banerjee', 'Full Stack Developer', 'NEW'],
  ['Mohit Kapoor', 'Frontend Developer', 'REVIEWING'],
  ['Shreya Pillai', 'UI/UX Designer', 'INTERVIEW'],
  ['Varun Bhat', 'Digital Marketing Executive', 'REJECTED'],
  ['Pallavi Sinha', 'Full Stack Developer', 'SHORTLISTED'],
  ['Yash Malhotra', 'Frontend Developer', 'NEW'],
];

export const careerApplications: CareerApplication[] = CAREER_ROWS.map(([name, position, status], i) => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
  return {
    id: id('career', i + 1),
    name,
    email: `${slug}@example.com`,
    phone: i % 2 === 0 ? `+91 55502 ${String(30000 + i * 97).slice(0, 5)}` : null,
    position,
    resumeUrl: `https://example.com/resumes/${slug}.pdf`,
    portfolioUrl: i % 2 === 1 ? `https://example.com/portfolio/${slug}` : null,
    message: i % 3 === 0 ? 'I would love to contribute to client projects.' : null,
    status,
    createdAt: at(i * 20 + 5),
    updatedAt: at(i * 20 + 4),
  };
});

export const newsletterSubscribers: NewsletterSubscriber[] = Array.from({ length: 13 }, (_, i) => ({
  id: id('subscriber', i + 1),
  email: `reader${i + 1}@example.com`,
  status: i % 5 === 4 ? 'UNSUBSCRIBED' : 'SUBSCRIBED',
  createdAt: at(i * 30 + 6),
}));
