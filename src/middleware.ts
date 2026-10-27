// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isOwnerAuthenticated } from './lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and login API endpoint freely
  if (pathname === '/owner/login' || pathname === '/api/owner/login') {
    return NextResponse.next();
  }

  // Check owner console pages
  if (pathname.startsWith('/owner')) {
    const authenticated = await isOwnerAuthenticated(req);
    if (!authenticated) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/owner/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Check owner API routes
  if (pathname.startsWith('/api/owner')) {
    const authenticated = await isOwnerAuthenticated(req);
    if (!authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized: Owner authentication required' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/owner/:path*', '/api/owner/:path*'],
};
