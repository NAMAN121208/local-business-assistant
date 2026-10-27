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

import { z } from 'zod';
import {
  CHAT_COOKIE_NAME,
  createCustomerSessionToken,
  isOwnerAuthenticated,
  verifyCustomerSessionToken,
} from '@/lib/auth';

const ChatBodySchema = z.object({
  text: z.string({ required_error: 'Text message is required' }),
  conversationId: z.string().max(100).optional(),
  customerId: z.string().max(100).optional(),
  senderName: z.string().max(100).optional(),
  senderContact: z.string().max(50).optional(),
});

export async function GET(req: NextRequest) {
  await initKnowledgeBase();
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (conversationId) {
    // 2.3 Access Control on Conversations: verify customer ownership or owner auth
    const isOwner = await isOwnerAuthenticated(req);
    const customerToken = req.cookies.get(CHAT_COOKIE_NAME)?.value;
    const isCustomerAuthorized = await verifyCustomerSessionToken(customerToken, conversationId);

    if (!isOwner && !isCustomerAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to access this conversation.' },
        { status: 403 }
      );
    }

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

    // Body size validation (max 64KB)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 65536) {
      return NextResponse.json(
        { error: 'Payload too large. Message body must be under 64KB.' },
        { status: 413 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    // 2. Strict Zod Input Validation
    const parseResult = ChatBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { text, conversationId, customerId, senderName, senderContact } = parseResult.data;

    // Strip zero-width & invisible control characters
    const sanitizedText = text.replace(/[\u200B-\u200D\uFEFF\u0000-\u0008\u000E-\u001F]/g, '').trim();

    // 3. Abuse Protection: Empty Message Validation
    if (!sanitizedText) {
      return NextResponse.json(
        { error: 'Empty message ignored. Please provide text.' },
        { status: 400 }
      );
    }

    // 4. Abuse Protection: Character Cap (500 chars max)
    if (sanitizedText.length > 500) {
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
      text: sanitizedText,
    });

    const res = NextResponse.json(response);

    // Set signed customer conversation session cookie for ownership
    if (response.conversationId) {
      const token = await createCustomerSessionToken(response.conversationId);
      res.cookies.set(CHAT_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

    return res;
  } catch (error: any) {
    console.error('Chat API Error:', error?.message || 'Unknown error');
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
