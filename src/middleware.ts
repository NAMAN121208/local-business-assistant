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

    // CSRF Protection on state-changing requests
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const origin = req.headers.get('origin');
      const host = req.headers.get('host');
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json(
              { error: 'Forbidden: Cross-site request forgery (CSRF) blocked' },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: 'Forbidden: Invalid request origin' },
            { status: 403 }
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/owner/:path*', '/api/owner/:path*'],
};
