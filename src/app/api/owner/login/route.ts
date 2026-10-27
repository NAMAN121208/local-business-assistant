// src/app/api/owner/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOwnerPassword, setSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const correctPassword = getOwnerPassword();

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
