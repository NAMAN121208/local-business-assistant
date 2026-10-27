// src/app/api/owner/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOwnerPassword, getSessionSecret, setSessionCookie } from '@/lib/auth';

interface LoginAttemptRecord {
  count: number;
  lockedUntil: number;
}

// In-memory rate limiting map (IP -> attempt record)
// Serverless limitation: In-memory counters are scoped per serverless lambda instance.
// For enterprise multi-region deployments, back with Upstash Redis or a database table.
const loginAttempts = new Map<string, LoginAttemptRecord>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginAttempts.get(ip);

    // Check if currently locked out
    if (record && record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Account temporarily locked for security. Please try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': remainingSeconds.toString(),
          },
        }
      );
    }

    const correctPassword = getOwnerPassword();
    const sessionSecret = getSessionSecret();

    if (!correctPassword || !sessionSecret) {
      console.error(
        '[AUTH CONFIG ERROR] Owner console login disabled: OWNER_PASSWORD and/or SESSION_SECRET environment variables are missing.'
      );
      return NextResponse.json(
        {
          error:
            'OWNER_PASSWORD and SESSION_SECRET environment variables must be configured on the server.',
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password || password !== correctPassword) {
      let currentAttempts = (record?.count || 0) + 1;
      if (record && record.lockedUntil > 0 && record.lockedUntil <= now) {
        // Lockout period expired; reset attempt counter
        currentAttempts = 1;
      }
      const willLock = currentAttempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = willLock ? now + LOCKOUT_DURATION_MS : 0;

      loginAttempts.set(ip, {
        count: currentAttempts,
        lockedUntil,
      });

      if (willLock) {
        return NextResponse.json(
          {
            error:
              'Too many failed login attempts. Account temporarily locked for 10 minutes.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': '600',
            },
          }
        );
      }

      return NextResponse.json(
        {
          error: `Incorrect owner password. (${MAX_FAILED_ATTEMPTS - currentAttempts} attempts remaining before lockout)`,
        },
        { status: 401 }
      );
    }

    // Success: clear failed attempts
    loginAttempts.delete(ip);

    const res = NextResponse.json({ success: true, message: 'Logged in successfully' });
    await setSessionCookie(res);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to process login' }, { status: 500 });
  }
}
