/**
 * Centralized domain + design configuration shared across all Globalantic portals.
 * Values come from public env vars so production domains are never hardcoded.
 */
const isProd = process.env.NODE_ENV === 'production';
/** Explicit env value, else the local dev port in development, else the production domain (never localhost in production). */
const pick = (v: string | undefined, dev: string, prod: string) => v || (isProd ? prod : dev);

export const domains = {
  main: pick(process.env.NEXT_PUBLIC_MAIN_DOMAIN, 'http://localhost:3000', 'https://globalantic.com'),
  training: pick(process.env.NEXT_PUBLIC_TRAINING_DOMAIN, 'http://localhost:3001', 'https://training.globalantic.com'),
  intern: pick(process.env.NEXT_PUBLIC_INTERN_DOMAIN, 'http://localhost:3002', 'https://intern.globalantic.com'),
  employee: pick(process.env.NEXT_PUBLIC_EMPLOYEE_DOMAIN, 'http://localhost:3003', 'https://employee.globalantic.com'),
  admin: pick(process.env.NEXT_PUBLIC_ADMIN_DOMAIN, 'http://localhost:3004', 'https://admin.globalantic.com'),
  trainer: pick(process.env.NEXT_PUBLIC_TRAINER_DOMAIN, 'http://localhost:3005', 'https://trainer.globalantic.com'),
  // No production default for the API: it must be set explicitly via NEXT_PUBLIC_API_URL.
  api: pick(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4000/api', ''),
} as const;

export const designTokens = {
  primary: '#6d22e6',
  primaryDark: '#4b14a8',
  primaryLight: '#a66cff',
  background: '#ffffff',
  surface: '#f7f5ff',
  textPrimary: '#14121f',
  textSecondary: '#56546a',
  border: '#eae7f2',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
} as const;
