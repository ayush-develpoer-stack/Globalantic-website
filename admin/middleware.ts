import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fast UX redirect only: no session cookie -> /login. Real authorisation
 * (session validity, role, permissions) is enforced by the API on every call.
 */
const COOKIE = 'globalantic_token';

export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, Next internals and static files.
  matcher: ['/((?!login|_next/|favicon\.ico|robots\.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
