// src/app/api/owner/conversations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conversation = await db.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const customer = await db.getCustomer(conversation.customer_id);
    const messages = await db.getRecentMessages(id, 50);
    const escalations = await db.getEscalations(id);
    const escalation = escalations.length > 0 ? escalations[0] : null;

    if (escalation && !escalation.is_read) {
      await db.markEscalationRead(escalation.id);
    }

    return NextResponse.json({
      conversation,
      customer: {
        id: customer?.id || conversation.customer_id,
        name: customer?.name || 'Anonymous Patient',
        contact: customer?.contact || 'Web Chat',
        preferredLanguage: customer?.preferred_language || 'en',
      },
      messages,
      escalation,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch conversation thread' }, { status: 500 });
  }
}
