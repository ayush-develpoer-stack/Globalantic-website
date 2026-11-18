import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap pre-check only: without the session cookie, send the visitor to /login.
 * The API still authorises every request (session, EMPLOYEE role, self-access).
 */
const SESSION_COOKIE = 'globalantic_token';

export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|_next/|favicon|icon|robots|.*\.(?:svg|png|jpg|jpeg|ico|webp|txt)$).*)'],
};
