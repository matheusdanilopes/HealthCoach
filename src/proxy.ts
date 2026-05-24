import { NextResponse, type NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginRoute = pathname.startsWith('/login');
  const isRegisterRoute = pathname.startsWith('/register');
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicRoute = pathname === '/' || isLoginRoute || isRegisterRoute || isApiRoute;

  // Read NextAuth v5 session cookie (name differs between HTTP and HTTPS)
  const isSecure = request.url.startsWith('https://');
  const cookieName = isSecure
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const cookieValue = request.cookies.get(cookieName)?.value;

  let isLoggedIn = false;
  if (cookieValue && process.env.AUTH_SECRET) {
    try {
      const token = await decode({
        token: cookieValue,
        secret: process.env.AUTH_SECRET,
        salt: cookieName,
      });
      isLoggedIn = !!token;
    } catch {
      // Invalid or expired token — treat as unauthenticated
    }
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Only redirect /login away; /register stays accessible for profile completion
  if (isLoggedIn && isLoginRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
