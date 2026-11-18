import { Hero } from '@/components/hero/Hero';
import { BusinessPositioning } from '@/components/sections/BusinessPositioning';
import { WhatWeBuild } from '@/components/sections/WhatWeBuild';
import { CoreServices } from '@/components/sections/CoreServices';
import { SolutionsSection } from '@/components/sections/SolutionsSection';
import { PortfolioSection } from '@/components/sections/PortfolioSection';
import { ProcessSection } from '@/components/sections/ProcessSection';
import { WhyGlobalantic } from '@/components/sections/WhyGlobalantic';
import { TechnologySection } from '@/components/sections/TechnologySection';
import { IndustriesSection } from '@/components/sections/IndustriesSection';
import { TrainingCTA } from '@/components/sections/TrainingCTA';
import { CTASection } from '@/components/sections/CTASection';
import { HomeContact } from '@/components/sections/HomeContact';
import { siteConfig } from '@/lib/config';
import { buildMetadata, websiteSchema } from '@/lib/seo';
import { jsonLd } from '@/lib/json-ld';

export const metadata = buildMetadata({ description: siteConfig.description, path: '/' });

export default async function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(websiteSchema()) }}
      />
      <Hero />
      <BusinessPositioning />
      <WhatWeBuild />
      <CoreServices />
      <SolutionsSection />
      <PortfolioSection />
      <ProcessSection />
      <WhyGlobalantic />
      <TechnologySection />
      <IndustriesSection />
      <TrainingCTA />
      <HomeContact />
      <CTASection label="home_band" />
    </>
  );
}
