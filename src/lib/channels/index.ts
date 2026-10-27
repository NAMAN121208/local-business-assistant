// src/lib/channels/index.ts
import { processMessage } from '../orchestrator';

export interface IncomingMessage {
  channel: 'web' | 'telegram' | 'whatsapp';
  businessId: string;
  conversationId?: string;
  customerId?: string;
  senderName?: string;
  senderContact?: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface OutgoingMessage {
  conversationId: string;
  text: string;
  decision: 'answer' | 'act' | 'escalate';
  intent?: string;
  provider?: string;
  failedOver?: boolean;
  quickReplies?: string[];
  metadata?: Record<string, any>;
}

export interface ChannelAdapter {
  name: string;
  receive(msg: IncomingMessage): Promise<OutgoingMessage>;
}

export class WebChatAdapter implements ChannelAdapter {
  name = 'web';

  async receive(msg: IncomingMessage): Promise<OutgoingMessage> {
    return await processMessage({
      businessId: msg.businessId,
      channel: 'web',
      conversationId: msg.conversationId,
      customerId: msg.customerId,
      senderName: msg.senderName,
      senderContact: msg.senderContact,
      text: msg.text,
    });
  }
}

export const webChatAdapter = new WebChatAdapter();

export class TelegramAdapter implements ChannelAdapter {
  name = 'telegram';

  async receive(msg: IncomingMessage): Promise<OutgoingMessage> {
    return await processMessage({
      businessId: msg.businessId,
      channel: 'telegram',
      conversationId: msg.conversationId,
      customerId: msg.customerId,
      senderName: msg.senderName,
      senderContact: msg.senderContact,
      text: msg.text,
    });
  }

  async sendTelegramReply(
    botToken: string,
    chatId: number | string,
    text: string,
    quickReplies?: string[]
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
    };

    if (quickReplies && quickReplies.length > 0) {
      payload.reply_markup = {
        inline_keyboard: quickReplies.map((qr) => [
          { text: qr, callback_data: qr.slice(0, 64) },
        ]),
      };
    }

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[Telegram] Failed to send message:', err);
    }
  }

  async notifyOwner(
    botToken: string,
    ownerChatId: string,
    alertText: string
  ): Promise<void> {
    if (!botToken || !ownerChatId) return;
    await this.sendTelegramReply(
      botToken,
      ownerChatId,
      `🚨 *City Health Clinic Alert*\n\n${alertText}`
    );
  }
}

export const telegramAdapter = new TelegramAdapter();

