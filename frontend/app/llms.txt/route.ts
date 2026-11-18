import { siteConfig, whatsappUrl } from '@/lib/config';
import { getIndustries, getServices, getSettings, getSolutions } from '@/lib/api';
import { contactDetails } from '@/lib/contact';

/**
 * /llms.txt — a plain-text, factual summary of the company and its pages for AI assistants
 * and crawlers (an emerging convention). Built from the same published content as the site;
 * no claims beyond what the pages say.
 */
export const revalidate = 3600;

export async function GET() {
  const [settings, services, solutions, industries] = await Promise.all([getSettings(), getServices(), getSolutions(), getIndustries()]);
  const base = siteConfig.url;
  const { phone, emails } = contactDetails(settings);
  const email = emails.join(', ');
  const whatsapp = whatsappUrl();

  const lines: string[] = [
    `# ${siteConfig.name}`,
    '',
    `> ${siteConfig.name} is an IT and digital solutions company. ${siteConfig.description}`,
    '',
    'Globalantic designs and builds websites, web applications, custom software, CRM and ERP systems, mobile apps, AI automation, e-commerce stores and APIs, and provides UI/UX design, branding, SEO, AEO, GEO and digital marketing services. It works with startups, small and medium businesses, agencies and established companies.',
    '',
    '## Contact',
    `- Website: ${base}`,
    `- Email: ${email}`,
    ...(phone ? [`- Phone / WhatsApp: ${phone}`] : []),
    `- Location: ${siteConfig.location}`,
    `- Founder: ${siteConfig.founder.name} (${siteConfig.founder.title})`,
    ...(whatsapp ? [`- WhatsApp: ${whatsapp}`] : []),
    `- Enquiries: ${base}/get-a-quote`,
    '',
    '## Services',
    ...(services ?? []).map((s) => `- [${s.title}](${base}/services/${s.slug}): ${s.shortDesc}`),
    '',
    '## Solutions',
    ...(solutions ?? []).map((s) => `- [${s.title}](${base}/solutions/${s.slug}): ${s.shortDesc}`),
    '',
    '## Industries',
    ...(industries ?? []).map((i) => `- [${i.title}](${base}/industries/${i.slug}): ${i.shortDesc}`),
    '',
    '## More',
    `- [About](${base}/about)`,
    `- [Portfolio](${base}/portfolio)`,
    `- [Blog](${base}/blog)`,
    `- [Training](${base}/training)`,
    `- [Globalantic Training — courses, batches and fees](${siteConfig.trainingUrl})`,
    `- [Careers](${base}/careers)`,
    `- [Contact](${base}/contact)`,
    `- [Sitemap](${base}/sitemap.xml)`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
