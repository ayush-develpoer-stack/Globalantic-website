import Link from 'next/link';
import { EmptyState, buttonClass } from '@globalantic/ui';

export default function NotFound() {
  return (
    <main className="container section">
      <EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Link href="/" className={buttonClass('primary', 'sm')}>Back to dashboard</Link>} />
    </main>
  );
}
