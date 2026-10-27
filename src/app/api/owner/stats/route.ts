// src/app/api/owner/stats/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await db.getOwnerDashboardStats(DEMO_CLINIC_ID);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch owner stats' }, { status: 500 });
  }
}
