// src/app/api/owner/kb/reset-demo/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID, demoClinicBusiness, demoClinicKBContent } from '@/lib/kb/demo-clinic';

export async function POST() {
  try {
    await db.upsertBusiness(demoClinicBusiness);
    const allVersions = await db.getAllKnowledgeBaseVersions(DEMO_CLINIC_ID);
    const nextVersionNum = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version)) + 1 : 1;

    const restored = await db.saveKnowledgeBaseVersion({
      id: `kb_${DEMO_CLINIC_ID}_v${nextVersionNum}`,
      business_id: DEMO_CLINIC_ID,
      version: nextVersionNum,
      content: demoClinicKBContent,
      raw_source_text: 'Restored original demo clinic seed knowledge base.',
      approved_by_owner: true,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      version: restored,
      message: 'Demo clinic knowledge base restored successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to reset demo clinic' }, { status: 500 });
  }
}
