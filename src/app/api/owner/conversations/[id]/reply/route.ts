// src/app/api/owner/conversations/[id]/reply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { telegramAdapter, whatsAppAdapter } from '@/lib/channels';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Reply text is required' }, { status: 400 });
    }

    const conversation = await db.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 1. Persist the owner message in the conversation thread
    const createdMsg = await db.createMessage({
      conversation_id: id,
      sender: 'owner',
      text: text.trim(),
      language: 'en',
      provider: 'owner_manual',
    });

    // 2. Deliver message to customer via their active channel (Telegram or WhatsApp)
    let channelDelivery = {
      channel: conversation.channel,
      delivered: false,
      error: undefined as string | undefined,
    };

    try {
      if (conversation.channel === 'telegram') {
        // Extract Telegram Chat ID from customer ID (telegram_cust_<chatId>) or conversation ID
        const customer = await db.getCustomer(conversation.customer_id);
        const match =
          conversation.customer_id.match(/^telegram_cust_(\d+)$/) ||
          conversation.id.match(/_(\d+)(?:_\d+)?$/);
        const chatId = match ? match[1] : customer?.contact || conversation.customer_id.replace(/\D/g, '');

        if (chatId) {
          const sendResult = await telegramAdapter.send(chatId, {
            text: `👨‍⚕️ *City Health Clinic Staff:*\n\n${text.trim()}`,
          });
          channelDelivery.delivered = sendResult.success;
          channelDelivery.error = sendResult.error;
        } else {
          channelDelivery.error = 'Unable to resolve Telegram chat ID for conversation';
        }
      } else if (conversation.channel === 'whatsapp') {
        // Extract WhatsApp phone number from customer record or customer ID (whatsapp_cust_<phone>)
        const customer = await db.getCustomer(conversation.customer_id);
        const recipientPhone =
          customer?.contact ||
          conversation.customer_id.replace(/^whatsapp_cust_/, '').replace(/\D/g, '');

        if (recipientPhone) {
          const sendResult = await whatsAppAdapter.send(recipientPhone, {
            text: `👨‍⚕️ City Health Clinic Staff:\n\n${text.trim()}`,
          });
          channelDelivery.delivered = sendResult.success;
          channelDelivery.error = sendResult.error;
        } else {
          channelDelivery.error = 'Unable to resolve WhatsApp recipient phone for conversation';
        }
      } else {
        // Web Chat messages appear directly on polling or page reload
        channelDelivery.delivered = true;
      }
    } catch (deliverErr: any) {
      console.warn(
        `[Owner Reply Delivery] Failed to deliver outbound channel message to ${conversation.channel}:`,
        deliverErr?.message || deliverErr
      );
      channelDelivery.error = deliverErr?.message || 'Delivery error';
    }

    return NextResponse.json({
      success: true,
      message: createdMsg,
      channelDelivery,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to post owner reply' }, { status: 500 });
  }
}
