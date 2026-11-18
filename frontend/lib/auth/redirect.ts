/**
 * Post-login destination. Only same-app admin paths are accepted, so a crafted
 * `?next=` link can never redirect a signed-in admin to another site.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (
    typeof next === 'string' &&
    next.startsWith('/admin/') &&
    !next.startsWith('//') &&
    !next.includes('://') &&
    // Browsers treat "\" like "/", so "/admin/\\evil.example" could escape the path.
    !next.includes('\\')
  ) {
    return next;
  }
  return '/admin/dashboard';
}
