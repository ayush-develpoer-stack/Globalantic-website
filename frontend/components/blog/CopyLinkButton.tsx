'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

/** Copies the article URL to the clipboard (no third-party share scripts). */
export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={copied ? 'Link copied' : 'Copy link'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt('Copy this link', url);
        }
      }}
    >
      {copied ? <Check size={18} aria-hidden /> : <Link2 size={18} aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </button>
  );
}
