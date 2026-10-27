// src/app/api/owner/kb/replay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/orchestrator';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export async function POST(req: NextRequest) {
  try {
    const { messageText, conversationId } = await req.json();

    if (!messageText || typeof messageText !== 'string' || !messageText.trim()) {
      return NextResponse.json({ error: 'Message text is required for replay' }, { status: 400 });
    }

    const replayConvId = conversationId
      ? `replay_${conversationId}_${Date.now()}`
      : `replay_${Date.now()}`;

    const response = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'web',
      conversationId: replayConvId,
      text: messageText.trim(),
    });

    return NextResponse.json({
      success: true,
      originalText: messageText,
      replyText: response.text,
      decision: response.decision,
      intent: response.intent,
      provider: response.provider,
    });
  } catch (err: any) {
    console.error('Replay Error:', err);
    return NextResponse.json({ error: 'Failed to replay question' }, { status: 500 });
  }
}
