import type { Metadata } from 'next';
import { LoginForm } from '@globalantic/ui';
import { TRAINING_URL } from '@/lib/config';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <LoginForm
      title="Student portal"
      subtitle="Sign in to see your courses, classes, payments and certificates."
      defaultNext="/"
      footer={
        <div className={styles.links}>
          <a href={`${TRAINING_URL}/forgot-password`}>Forgot password?</a>
          <a href={`${TRAINING_URL}/register`}>Create an account</a>
        </div>
      }
    />
  );
}
