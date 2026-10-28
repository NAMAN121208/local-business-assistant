// src/app/api/whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  whatsAppAdapter,
  isChannelRateLimited,
  getFriendlyRateLimitMessage,
} from '@/lib/channels';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';
import { db } from '@/lib/db';
import { processMessage } from '@/lib/orchestrator';
import { initKnowledgeBase } from '@/lib/kb';

export const maxDuration = 60;

/**
 * GET Webhook Verification for Meta Developer Platform
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const verifyToken = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const result = whatsAppAdapter.verifySubscription(mode, verifyToken, challenge);
  if (result.valid && result.challenge) {
    return new Response(result.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    { error: result.error || 'Verification failed' },
    { status: result.status }
  );
}

/**
 * POST Webhook Handling for Inbound WhatsApp Messages
 */
export async function POST(req: NextRequest) {
  try {
    await initKnowledgeBase();

    // 1. Read Raw Body for HMAC Signature Verification
    const rawBody = await req.text().catch(() => '');

    // 2. Validate X-Hub-Signature-256 with Constant-Time Comparison
    const authResult = await whatsAppAdapter.verifyRequest(req, rawBody);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    // 3. Parse Incoming Message Payload
    const parsed = await whatsAppAdapter.parseIncoming(req, body);
    if (!parsed) {
      // Delivery receipts or status updates are acknowledged immediately
      return NextResponse.json({ ok: true });
    }

    // 4. Duplicate Protection (Idempotency)
    const isDuplicate = await db.isMessageProcessed('whatsapp', parsed.messageId);
    if (isDuplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await db.recordProcessedMessage('whatsapp', parsed.messageId, parsed.senderId);

    // 5. Rate Limiting per (channel, senderId)
    if (isChannelRateLimited('whatsapp', parsed.senderId, 20, 60000)) {
      await whatsAppAdapter.send(parsed.senderId, {
        text: getFriendlyRateLimitMessage(),
      });
      return NextResponse.json({ ok: true, rateLimited: true });
    }

    // 6. Non-Text Message Handling (Images, Voice, Video, Documents, Stickers)
    if (parsed.isNonTextMessage) {
      const nonTextReply = whatsAppAdapter.getNonTextReply();
      await whatsAppAdapter.send(parsed.senderId, nonTextReply);
      return NextResponse.json({ ok: true, handled: 'non_text' });
    }

    // 7. Identity & Open Conversation Mapping
    const { customer, conversation } = await db.getOrCreateChannelConversation(
      DEMO_CLINIC_ID,
      'whatsapp',
      parsed.senderId,
      parsed.displayName,
      parsed.phone
    );

    // 8. Run Orchestrator Pipeline
    const reqStart = Date.now();
    const reply = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'whatsapp',
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
        event: 'whatsapp_request_processed',
        conversationId: conversation.id,
        decision: reply.decision,
        provider: reply.provider,
        latencyMs,
      })
    );

    // 9. Dispatch Reply via Meta Graph API (Buttons for <=3 options, List Menu for >3 options)
    await whatsAppAdapter.send(parsed.senderId, {
      text: reply.text,
      quickReplies: reply.quickReplies,
      metadata: { lastUserMessageTime: parsed.timestamp },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('WhatsApp Webhook Exception:', err?.message || 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
