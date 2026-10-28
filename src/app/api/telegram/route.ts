// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  telegramAdapter,
  isChannelRateLimited,
  getFriendlyRateLimitMessage,
} from '@/lib/channels';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';
import { db } from '@/lib/db';
import { processMessage } from '@/lib/orchestrator';
import { initKnowledgeBase } from '@/lib/kb';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await initKnowledgeBase();

    // 1. Secret-Token Verification per Telegram Bot API standards
    const authResult = await telegramAdapter.verifyRequest(req);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const update = await req.json().catch(() => null);
    if (!update) {
      return NextResponse.json({ ok: true });
    }

    // 2. Parse Incoming Update
    const parsed = await telegramAdapter.parseIncoming(req, update);
    if (!parsed) {
      return NextResponse.json({ ok: true });
    }

    // 3. Duplicate Protection (Idempotency)
    const isDuplicate = await db.isMessageProcessed('telegram', parsed.messageId);
    if (isDuplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await db.recordProcessedMessage('telegram', parsed.messageId, parsed.senderId);

    // 4. Rate Limiting per (channel, senderId)
    if (isChannelRateLimited('telegram', parsed.senderId, 20, 60000)) {
      await telegramAdapter.send(parsed.senderId, {
        text: getFriendlyRateLimitMessage(),
      });
      return NextResponse.json({ ok: true, rateLimited: true });
    }

    // 5. Handle /start Greeting Command
    if (parsed.isStartCommand) {
      const startReply = telegramAdapter.getStartReply();
      await telegramAdapter.send(parsed.senderId, startReply);
      return NextResponse.json({ ok: true, handled: 'start' });
    }

    // 6. Handle Non-Text Messages (Photos, Voice, Stickers, Audio, etc.)
    if (parsed.isNonTextMessage) {
      const nonTextReply = telegramAdapter.getNonTextReply();
      await telegramAdapter.send(parsed.senderId, nonTextReply);
      return NextResponse.json({ ok: true, handled: 'non_text' });
    }

    // 7. Identity & Open Conversation Mapping
    const { customer, conversation } = await db.getOrCreateChannelConversation(
      DEMO_CLINIC_ID,
      'telegram',
      parsed.senderId,
      parsed.displayName,
      parsed.phone
    );

    // 8. Run Orchestrator Pipeline
    const reqStart = Date.now();
    const reply = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'telegram',
      conversationId: conversation.id,
      customerId: customer.id,
      senderName: customer.name || parsed.displayName,
      senderContact: customer.contact || parsed.phone,
      text: parsed.text,
    });
    const latencyMs = Date.now() - reqStart;

    // Log operational metrics without leaking message text or PII
    console.info(
      JSON.stringify({
        event: 'telegram_request_processed',
        conversationId: conversation.id,
        decision: reply.decision,
        provider: reply.provider,
        latencyMs,
      })
    );

    // 9. Dispatch Reply with Inline Buttons
    await telegramAdapter.send(parsed.senderId, {
      text: reply.text,
      quickReplies: reply.quickReplies,
    });

    // 10. Owner Alert on Escalation or Booking
    if (reply.decision === 'escalate' || reply.intent === 'booking_create') {
      const alertMsg = `Patient: ${customer.name || 'Telegram Patient'}\nDecision: ${reply.decision}\nIntent: ${reply.intent || 'general'}\nConv ID: ${conversation.id}`;
      await telegramAdapter.notifyOwner(alertMsg);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram Webhook Exception:', err?.message || 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
