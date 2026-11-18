/**
 * Acquisition channel of a lead, derived from what the enquiry form recorded (first-touch
 * external referrer + utm_* tags). It is a best-effort label, not proof: many browsers and apps
 * strip referrers, so "Direct / unknown" also contains search and social visits.
 */
export type Channel = 'Organic search' | 'AI assistant' | 'Paid' | 'Social' | 'Email' | 'Campaign (other)' | 'Referral' | 'Direct / unknown';

const AI_HOSTS = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com)$/;
const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z.]+|ecosia\.org|baidu\.com|search\.brave\.com|startpage\.com)$/;
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|t\.co|twitter\.com|x\.com|youtube\.com|whatsapp\.com|wa\.me|pinterest\.[a-z.]+|reddit\.com|quora\.com)$/;

function host(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function leadChannel(lead: { referrer?: string | null; utmSource?: string | null; utmMedium?: string | null }): Channel {
  const medium = (lead.utmMedium ?? '').toLowerCase();
  const source = (lead.utmSource ?? '').toLowerCase();
  if (/^(cpc|ppc|paid|paidsearch|paid_social|paid-social|display|cpm|ads?)$/.test(medium)) return 'Paid';
  if (medium === 'email' || medium === 'newsletter') return 'Email';
  if (medium === 'social' || medium === 'social-media') return 'Social';
  if (medium === 'organic') return 'Organic search';
  if (source) return 'Campaign (other)';
  const h = host(lead.referrer);
  if (!h) return 'Direct / unknown';
  if (AI_HOSTS.test(h)) return 'AI assistant';
  if (SEARCH_HOSTS.test(h)) return 'Organic search';
  if (SOCIAL_HOSTS.test(h)) return 'Social';
  return 'Referral';
}

/** Landing page path without query string or fragment (UTM variants collapse to one row). */
export function landingPath(landingPage: string | null | undefined): string {
  if (!landingPage) return 'Not recorded';
  return landingPage.split(/[?#]/)[0] || '/';
}
