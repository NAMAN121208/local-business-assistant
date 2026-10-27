// src/app/api/owner/escalations/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const escalations = await db.getEscalations();

    const enriched = await Promise.all(
      escalations.map(async (esc) => {
        const conv = await db.getConversation(esc.conversation_id);
        const customer = conv ? await db.getCustomer(conv.customer_id) : null;
        const messages = await db.getRecentMessages(esc.conversation_id, 10);
        const customerMsg = [...messages].reverse().find((m) => m.sender === 'customer');
        const botReply = [...messages].reverse().find((m) => m.sender === 'bot');

        return {
          id: esc.id,
          conversationId: esc.conversation_id,
          reason: esc.reason,
          aiSummary: esc.ai_summary,
          suggestedReply: esc.suggested_reply,
          status: esc.status,
          isRead: esc.is_read,
          createdAt: esc.created_at,
          customer: {
            name: customer?.name || 'Anonymous Patient',
            contact: customer?.contact || 'Web Chat',
          },
          lastCustomerMessage: customerMsg?.text || '',
          lastBotReply: botReply?.text || '',
        };
      })
    );

    return NextResponse.json({ escalations: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch escalations' }, { status: 500 });
  }
}
