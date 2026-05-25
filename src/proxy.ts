import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginRoute = pathname.startsWith('/login');
  const isRegisterRoute = pathname.startsWith('/register');
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicRoute = pathname === '/' || isLoginRoute || isRegisterRoute || isApiRoute;

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check cookie presence only — JWT verification happens in each page via auth()
  const isSecure = request.url.startsWith('https://');
  const cookieName = isSecure
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const hasSession = !!request.cookies.get(cookieName)?.value;

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
