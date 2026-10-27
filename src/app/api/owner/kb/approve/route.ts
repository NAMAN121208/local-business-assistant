// src/app/api/owner/kb/approve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export async function POST(req: NextRequest) {
  try {
    const { content, rawSourceText, changelog } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Knowledge base content is required' }, { status: 400 });
    }

    const allVersions = await db.getAllKnowledgeBaseVersions(DEMO_CLINIC_ID);
    const nextVersionNum = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version)) + 1 : 1;

    const newVersion = await db.saveKnowledgeBaseVersion({
      id: `kb_${DEMO_CLINIC_ID}_v${nextVersionNum}`,
      business_id: DEMO_CLINIC_ID,
      version: nextVersionNum,
      content,
      raw_source_text: rawSourceText || null,
      approved_by_owner: true,
      changelog: changelog || [],
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      version: newVersion,
      message: `Knowledge Base version ${nextVersionNum} approved and active!`,
    });
  } catch (err: any) {
    console.error('KB Approve Error:', err);
    return NextResponse.json({ error: 'Failed to approve knowledge base' }, { status: 500 });
  }
}
