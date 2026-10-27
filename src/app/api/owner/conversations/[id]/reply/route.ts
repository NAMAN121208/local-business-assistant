// src/app/api/owner/conversations/[id]/reply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Reply text is required' }, { status: 400 });
    }

    const conversation = await db.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const createdMsg = await db.createMessage({
      conversation_id: id,
      sender: 'owner',
      text: text.trim(),
      language: 'en',
      provider: 'owner_manual',
    });

    return NextResponse.json({ success: true, message: createdMsg });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to post owner reply' }, { status: 500 });
  }
}
