// src/app/api/owner/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';
import { ConversationStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as ConversationStatus | null;

    const conversations = await db.getAllConversations(
      DEMO_CLINIC_ID,
      status && status !== ('all' as any) ? { status } : undefined
    );

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const customer = await db.getCustomer(conv.customer_id);
        const messages = await db.getRecentMessages(conv.id, 5);
        const lastMsg = messages[messages.length - 1] || null;
        const lastBotMsg = [...messages].reverse().find((m) => m.sender === 'bot') || null;

        return {
          id: conv.id,
          status: conv.status,
          channel: conv.channel,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
          customer: {
            id: conv.customer_id,
            name: customer?.name || 'Anonymous Patient',
            contact: customer?.contact || 'Web Chat',
          },
          lastMessage: lastMsg
            ? {
                text: lastMsg.text,
                sender: lastMsg.sender,
                createdAt: lastMsg.created_at,
              }
            : null,
          latestDecision: lastBotMsg?.decision || null,
          latestIntent: lastBotMsg?.intent || null,
          provider: lastBotMsg?.provider || null,
        };
      })
    );

    return NextResponse.json({ conversations: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
