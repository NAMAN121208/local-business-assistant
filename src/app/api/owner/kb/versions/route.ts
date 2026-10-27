// src/app/api/owner/kb/versions/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const versions = await db.getAllKnowledgeBaseVersions(DEMO_CLINIC_ID);
    return NextResponse.json({ versions });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch KB versions' }, { status: 500 });
  }
}
