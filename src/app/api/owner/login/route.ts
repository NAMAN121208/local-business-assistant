// src/app/api/owner/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOwnerPassword, getSessionSecret, setSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Incorrect owner password' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, message: 'Logged in successfully' });
    await setSessionCookie(res);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to process login' }, { status: 500 });
  }
}
