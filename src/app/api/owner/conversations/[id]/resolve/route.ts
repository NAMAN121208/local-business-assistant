// src/app/api/owner/conversations/[id]/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conversation = await db.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await db.updateConversationStatus(id, 'resolved');

    const escalations = await db.getEscalations(id);
    for (const esc of escalations) {
      if (esc.status === 'open') {
        await db.resolveEscalation(esc.id);
      }
    }

    return NextResponse.json({ success: true, status: 'resolved' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 });
  }
}
