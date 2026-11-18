import { NextResponse, type NextRequest } from 'next/server';

/**
 * UX guard only: without a session cookie, send the visitor to /login.
 * The API remains the authority (session, role and ownership checks).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/login' || req.cookies.has('globalantic_token')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\.(?:png|jpg|jpeg|svg|webp|ico|css|js)$).*)'],
};
