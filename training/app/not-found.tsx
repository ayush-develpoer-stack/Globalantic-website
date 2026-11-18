import { EmptyState } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import s from '@/styles/site.module.css';

export default function NotFound() {
  return (
    <div className={`container ${s.page}`}>
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={
          <div className={s.row}>
            <ButtonLink href="/">Home</ButtonLink>
            <ButtonLink href="/courses" variant="outline">
              Browse courses
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
