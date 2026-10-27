// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { telegramAdapter } from '@/lib/channels';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export async function POST(req: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;

    if (!botToken) {
      return NextResponse.json(
        { error: 'Telegram integration is disabled' },
        { status: 503 }
      );
    }

    // 1. Verify Secret Header: Webhook secret verification
    if (webhookSecret) {
      const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== webhookSecret) {
        return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'TELEGRAM_WEBHOOK_SECRET must be configured in production' },
        { status: 500 }
      );
    }

    const update = await req.json().catch(() => null);
    if (!update) {
      return NextResponse.json({ ok: true });
    }

    // Handle normal text message or inline callback query
    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    const chatId = message?.chat?.id || callbackQuery?.message?.chat?.id;
    const userText = message?.text || callbackQuery?.data;
    const senderName =
      message?.from?.first_name ||
      callbackQuery?.from?.first_name ||
      'Telegram User';
    const senderUsername =
      message?.from?.username || callbackQuery?.from?.username || '';

    if (!chatId || !userText) {
      return NextResponse.json({ ok: true });
    }

    // Run orchestrator through channel adapter
    const reply = await telegramAdapter.receive({
      channel: 'telegram',
      businessId: DEMO_CLINIC_ID,
      conversationId: `tg_chat_${chatId}`,
      customerId: `tg_user_${chatId}`,
      senderName: senderUsername ? `${senderName} (@${senderUsername})` : senderName,
      text: userText,
    });

    // Send response back via Telegram API with slot buttons
    await telegramAdapter.sendTelegramReply(
      botToken,
      chatId,
      reply.text,
      reply.quickReplies
    );

    // Notify clinic owner on escalations or bookings if configured
    if (ownerChatId && (reply.decision === 'escalate' || reply.intent === 'booking_create')) {
      const alertMsg = `Patient: ${senderName}\nDecision: ${reply.decision}\nMessage: "${userText}"\nReply: "${reply.text.slice(0, 120)}..."`;
      await telegramAdapter.notifyOwner(botToken, ownerChatId, alertMsg);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram Webhook Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
