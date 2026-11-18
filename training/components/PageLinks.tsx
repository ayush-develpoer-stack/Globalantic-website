import Link from 'next/link';
import s from '@/styles/site.module.css';

/** Server-rendered pagination using plain links (works without JavaScript). */
export function PageLinks({ basePath, params, page, totalPages }: { basePath: string; params: Record<string, string>; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className={s.row} style={{ justifyContent: 'center', marginTop: 24 }}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={s.inlineLink} rel="prev">
          ← Previous
        </Link>
      ) : (
        <span className={s.muted}>← Previous</span>
      )}
      <span className={s.muted} aria-current="page">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={s.inlineLink} rel="next">
          Next →
        </Link>
      ) : (
        <span className={s.muted}>Next →</span>
      )}
    </nav>
  );
}
