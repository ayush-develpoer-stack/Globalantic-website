import { apiConfig, isMockMode } from '@/lib/api/config';

/**
 * Lead attribution and anonymous click tracking (browser only).
 *
 * - First touch per browser session: landing page, external referrer and utm_* parameters are kept
 *   in sessionStorage and sent ONLY with an enquiry the visitor chooses to submit.
 * - CTA / WhatsApp clicks are counted anonymously (type, label, page path, campaign) — no cookies,
 *   identifiers or personal data. Failures are ignored; tracking never blocks navigation.
 */

export interface Attribution {
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

const KEY = 'globalantic.attribution';
const UTM: [string, keyof Attribution][] = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_term', 'utmTerm'],
  ['utm_content', 'utmContent'],
];

function read(): Attribution {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Attribution;
  } catch {
    return {};
  }
}

/** Call once per page load. Keeps the first landing page; a new campaign link updates the UTM fields. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  const current = read();
  const params = new URLSearchParams(window.location.search);
  const next: Attribution = { ...current };
  if (!next.landingPage) next.landingPage = (window.location.pathname + window.location.search).slice(0, 300);
  if (!next.referrer && document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.host !== window.location.host) next.referrer = `${ref.origin}${ref.pathname}`.slice(0, 300);
    } catch {
      // ignore malformed referrers
    }
  }
  if (UTM.some(([p]) => params.get(p))) {
    for (const [p, k] of UTM) next[k] = params.get(p)?.slice(0, 150) || undefined;
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: attribution is simply not sent
  }
}

export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  return read();
}

/** Anonymous click counter. Fire-and-forget; keepalive lets it finish while the page navigates. */
export function trackClick(type: 'cta_click' | 'whatsapp_click', label: string, service?: string | null): void {
  if (typeof window === 'undefined' || isMockMode || !apiConfig.apiUrl) return;
  const a = read();
  const body = JSON.stringify({
    type,
    label: label.slice(0, 80),
    page: window.location.pathname.slice(0, 200),
    ...(service ? { service: service.slice(0, 120) } : {}),
    ...(a.utmSource ? { utmSource: a.utmSource } : {}),
    ...(a.utmMedium ? { utmMedium: a.utmMedium } : {}),
    ...(a.utmCampaign ? { utmCampaign: a.utmCampaign } : {}),
  });
  try {
    void fetch(`${apiConfig.apiUrl}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    // never block the click
  }
}
