import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isLoginRoute = pathname.startsWith('/login');
  const isRegisterRoute = pathname.startsWith('/register');
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicRoute = pathname === '/' || isLoginRoute || isRegisterRoute || isApiRoute;

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Only redirect away from /login; /register stays accessible for profile completion
  if (isLoggedIn && isLoginRoute) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
