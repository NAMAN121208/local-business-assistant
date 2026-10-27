// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { webChatAdapter } from '@/lib/channels';
import { DEMO_CLINIC_ID, demoClinicBusiness } from '@/lib/kb/demo-clinic';
import { db } from '@/lib/db';
import { initKnowledgeBase } from '@/lib/kb';
import { detectLanguage } from '@/lib/locale/detector';
import { getLocalizedTemplate } from '@/lib/locale/templates';

// In-memory sliding window rate limiter: 20 messages per minute per IP
interface RateLimitRecord {
  timestamps: number[];
}
const ipRateLimits = new Map<string, RateLimitRecord>();

function isRateLimited(ip: string, limit: number = 20, windowMs: number = 60000): boolean {
  const now = Date.now();
  let record = ipRateLimits.get(ip);
  if (!record) {
    record = { timestamps: [] };
    ipRateLimits.set(ip, record);
  }

  // Filter timestamps within window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  record.timestamps.push(now);
  return false;
}

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

    // 1. Abuse Protection: Rate Limiting
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    if (isRateLimited(clientIp, 20, 60000)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          text: getLocalizedTemplate('rate_limit_exceeded', 'en'),
          decision: 'escalate',
          provider: 'abuse_protection_ratelimit',
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { text, conversationId, customerId, senderName, senderContact } = body;

    // 2. Abuse Protection: Empty Message Validation
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { error: 'Empty message ignored. Please provide text.' },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();

    // 3. Abuse Protection: Character Cap (500 chars max)
    if (trimmedText.length > 500) {
      return NextResponse.json(
        {
          error: 'Message exceeds 500 characters limit. Please shorten your message.',
        },
        { status: 400 }
      );
    }

    const response = await webChatAdapter.receive({
      channel: 'web',
      businessId: DEMO_CLINIC_ID,
      conversationId,
      customerId,
      senderName,
      senderContact,
      text: trimmedText,
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
