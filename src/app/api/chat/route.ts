// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { webChatAdapter } from '@/lib/channels';
import { DEMO_CLINIC_ID, demoClinicBusiness } from '@/lib/kb/demo-clinic';
import { db } from '@/lib/db';
import { initKnowledgeBase } from '@/lib/kb';

export async function GET(req: NextRequest) {
  await initKnowledgeBase();
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (conversationId) {
    const conv = await db.getConversation(conversationId);
    const messages = await db.getRecentMessages(conversationId, 40);
    return NextResponse.json({
      conversationId,
      status: conv?.status || 'open',
      messages,
    });
  }

  const biz = (await db.getBusiness(DEMO_CLINIC_ID)) || demoClinicBusiness;
  return NextResponse.json({
    business: biz,
    status: 'ok',
    welcomeMessage:
      'Hello! Welcome to City Health Clinic. I can help you check doctor timings, book an appointment, or answer questions about our clinic services in Indiranagar. How may I assist you today?',
    quickReplies: [
      'What are your clinic timings?',
      'Book doctor appointment tomorrow',
      'Where is the clinic located?',
      'What are the consultation fees?',
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    await initKnowledgeBase();
    const body = await req.json();
    const { text, conversationId, customerId, senderName, senderContact } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text message is required' }, { status: 400 });
    }

    const response = await webChatAdapter.receive({
      channel: 'web',
      businessId: DEMO_CLINIC_ID,
      conversationId,
      customerId,
      senderName,
      senderContact,
      text: text.trim(),
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        text: 'City Health Clinic automated assistant is temporarily busy. Please call our clinic desk at +91 98765 43210.',
        decision: 'escalate',
        provider: 'fallback',
      },
      { status: 500 }
    );
  }
}
