import { FAQS } from '@/lib/content';
import s from '@/styles/site.module.css';

export function Faq({ limit }: { limit?: number }) {
  const items = limit ? FAQS.slice(0, limit) : FAQS;
  return (
    <div className={s.faq}>
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
