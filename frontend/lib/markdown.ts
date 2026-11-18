/**
 * Tiny, dependency-free markdown parser for CMS articles. It produces plain data (block and
 * inline tokens) that components render as React children, so any HTML in the content is
 * escaped by React — nothing from the CMS is ever injected as raw HTML.
 *
 * Supported: ## / ### headings, paragraphs, - / * bullet lists, 1. numbered lists,
 * > quotes, **bold**, *italic*, `code` and [links](url) (https, site-relative or mailto only).
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'h2' | 'h3'; id: string; text: string; inline: Inline[] }
  | { type: 'p' | 'quote'; inline: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] };

/** Turns heading text into a URL-safe anchor id. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Only these link targets become links; anything else (javascript:, data:, //host) stays text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https:\/\//i.test(h)) return h;
  if (/^mailto:[^\s]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s]*$/.test(h)) return h;
  if (/^#[\w-]+$/.test(h)) return h;
  return null;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\*\*([^*]+)\*\*$/.exec(part))) out.push({ type: 'strong', text: m[1] });
    else if ((m = /^\*([^*]+)\*$/.exec(part))) out.push({ type: 'em', text: m[1] });
    else if ((m = /^`([^`]+)`$/.exec(part))) out.push({ type: 'code', text: m[1] });
    else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part))) {
      const href = safeHref(m[2]);
      out.push(href ? { type: 'link', text: m[1], href } : { type: 'text', text: m[1] });
    } else out.push({ type: 'text', text: part });
  }
  return out;
}

export function parseMarkdown(markdown: string): Block[] {
  if (!markdown || !markdown.trim()) return [];
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', inline: parseInline(paragraph.join(' ')) });
    if (quote.length) blocks.push({ type: 'quote', inline: parseInline(quote.join(' ')) });
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    paragraph = [];
    quote = [];
    list = null;
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2].replace(/\*\*/g, '').trim();
      blocks.push({ type: heading[1].length === 2 ? 'h2' : 'h3', id: slugify(text), text, inline: parseInline(heading[2].trim()) });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (paragraph.length || quote.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      if (paragraph.length || list) flush();
      quote.push(q[1]);
      continue;
    }
    if (list || quote.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** ## / ### headings for the table of contents. */
export function extractHeadings(markdown: string): { id: string; text: string; level: number }[] {
  return parseMarkdown(markdown)
    .filter((b): b is Extract<Block, { type: 'h2' | 'h3' }> => (b.type === 'h2' || b.type === 'h3') && Boolean(b.text))
    .map((b) => ({ id: b.id, text: b.text, level: b.type === 'h2' ? 2 : 3 }));
}

/** Words-per-minute estimate, used when the CMS has no reading time. */
export function readingMinutes(markdown: string): number {
  const words = (markdown || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
