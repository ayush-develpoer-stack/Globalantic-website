import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/footer/Footer';
import { AttributionCapture } from '@/components/marketing/AttributionCapture';
import { WhatsAppFloat } from '@/components/marketing/WhatsApp';
import { getSettings } from '@/lib/api';
import { organizationSchema } from '@/lib/seo';
import { contactDetails } from '@/lib/contact';
import { jsonLd } from '@/lib/json-ld';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  // One Organization entity for the public site, built only from configured facts.
  const contact = contactDetails(settings);
  const org = organizationSchema({
    email: contact.email,
    phone: contact.phone,
    socials: [settings?.linkedinUrl, settings?.instagramUrl, settings?.facebookUrl, settings?.twitterUrl, settings?.youtubeUrl],
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(org) }} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
      <WhatsAppFloat />
      <AttributionCapture />
    </>
  );
}
