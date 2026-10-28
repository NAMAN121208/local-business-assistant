// src/lib/channels/telegram.ts
import {
  ChannelAdapter,
  ChannelSendResult,
  ChannelVerificationResult,
  IncomingMessageParsed,
  OutgoingChannelMessage,
} from './types';

export class TelegramAdapter implements ChannelAdapter {
  readonly channel: 'telegram' = 'telegram';

  private getBotToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private getWebhookSecret(): string | undefined {
    return process.env.TELEGRAM_WEBHOOK_SECRET;
  }

  private getOwnerChatId(): string | undefined {
    return process.env.TELEGRAM_OWNER_CHAT_ID;
  }

  /**
   * Secret-token webhook verification per Telegram Bot API guidelines
   */
  async verifyRequest(
    req: Request | any,
    _rawBody?: string
  ): Promise<ChannelVerificationResult> {
    const botToken = this.getBotToken();
    const webhookSecret = this.getWebhookSecret();
    const isProduction = process.env.NODE_ENV === 'production';

    if (!botToken) {
      return {
        valid: false,
        status: 503,
        error: 'Telegram integration is disabled (TELEGRAM_BOT_TOKEN unset)',
      };
    }

    if (webhookSecret) {
      const headerSecret =
        typeof req.headers?.get === 'function'
          ? req.headers.get('x-telegram-bot-api-secret-token')
          : req.headers?.['x-telegram-bot-api-secret-token'];

      if (headerSecret !== webhookSecret) {
        return {
          valid: false,
          status: 401,
          error: 'Unauthorized: Invalid Telegram webhook secret token',
        };
      }
    } else if (isProduction) {
      return {
        valid: false,
        status: 500,
        error: 'TELEGRAM_WEBHOOK_SECRET must be configured in production',
      };
    }

    return { valid: true, status: 200 };
  }

  /**
   * Parse incoming Telegram update payload into normalized message structure
   */
  async parseIncoming(
    _req: Request | any,
    update: any
  ): Promise<IncomingMessageParsed | null> {
    if (!update || typeof update !== 'object') {
      return null;
    }

    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    const chatId = message?.chat?.id ?? callbackQuery?.message?.chat?.id;
    if (chatId === undefined || chatId === null) {
      return null;
    }

    const senderId = String(chatId);
    const messageId = String(message?.message_id ?? callbackQuery?.id ?? `tg_${Date.now()}`);

    const fromUser = message?.from || callbackQuery?.from;
    const firstName = fromUser?.first_name || '';
    const lastName = fromUser?.last_name || '';
    const username = fromUser?.username || '';
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || (username ? `@${username}` : 'Telegram User');

    // Handle Contact Sharing
    if (message?.contact?.phone_number) {
      const rawPhone = message.contact.phone_number;
      const cleanPhone = rawPhone.replace(/\D/g, '');
      return {
        channel: 'telegram',
        senderId,
        messageId,
        text: `Phone verified: ${cleanPhone}`,
        displayName,
        phone: cleanPhone,
        rawPayload: update,
        isContactShare: true,
      };
    }

    // Handle Callback Query (e.g., inline slot buttons)
    if (callbackQuery?.data) {
      return {
        channel: 'telegram',
        senderId,
        messageId,
        text: callbackQuery.data,
        displayName,
        rawPayload: update,
      };
    }

    // Handle Non-Text Messages (photos, voice, audio, stickers, etc.)
    const nonTextType =
      (message?.photo && 'photo') ||
      (message?.voice && 'voice') ||
      (message?.audio && 'audio') ||
      (message?.sticker && 'sticker') ||
      (message?.document && 'document') ||
      (message?.video && 'video') ||
      (message?.location && 'location');

    if (nonTextType && !message?.text && !message?.caption) {
      return {
        channel: 'telegram',
        senderId,
        messageId,
        text: '',
        displayName,
        rawPayload: update,
        isNonTextMessage: true,
        nonTextType,
      };
    }

    const rawText = message?.text || message?.caption || '';
    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }

    const isStartCommand = trimmed.toLowerCase() === '/start';

    return {
      channel: 'telegram',
      senderId,
      messageId,
      text: trimmed,
      displayName,
      rawPayload: update,
      isStartCommand,
    };
  }

  /**
   * Dispatch response to user via Telegram Bot API
   */
  async send(
    recipientId: string,
    message: OutgoingChannelMessage
  ): Promise<ChannelSendResult> {
    const botToken = this.getBotToken();
    if (!botToken) {
      return {
        success: false,
        error: 'TELEGRAM_BOT_TOKEN not configured',
      };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload: any = {
      chat_id: recipientId,
      text: message.text,
    };

    // Inline Keyboard Buttons for appointment slot options or choices
    if (message.quickReplies && message.quickReplies.length > 0) {
      payload.reply_markup = {
        inline_keyboard: message.quickReplies.map((qr) => [
          { text: qr, callback_data: qr.slice(0, 64) },
        ]),
      };
    }

    // If message mentions phone verification for cancellation, provide share contact reply keyboard
    if (message.metadata?.requireContactShare) {
      payload.reply_markup = {
        keyboard: [
          [{ text: '📱 Share Phone Number to Verify Booking', request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          error: `Telegram API returned ${res.status}: ${errText.slice(0, 100)}`,
        };
      }

      const resData = await res.json().catch(() => ({}));
      return {
        success: true,
        messageId: resData?.result?.message_id ? String(resData.result.message_id) : undefined,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error sending to Telegram',
      };
    }
  }

  /**
   * Owner notification via TELEGRAM_OWNER_CHAT_ID
   */
  async notifyOwner(alertText: string): Promise<void> {
    const botToken = this.getBotToken();
    const ownerChatId = this.getOwnerChatId();
    if (!botToken || !ownerChatId) return;

    await this.send(ownerChatId, {
      text: `🚨 *City Health Clinic Notification*\n\n${alertText}`,
    });
  }

  getStartReply(): OutgoingChannelMessage {
    return {
      text:
        '🏥 Welcome to City Health Clinic (Indiranagar, Bengaluru) AI Front-Desk Assistant.\n\n' +
        'I can assist you with checking clinic timings, doctor consultation fees, and scheduling outpatient appointments.\n\n' +
        '⚠️ Notice: This automated bot is for routine appointment scheduling and clinic information. For medical emergencies or acute symptoms, please call our 24/7 emergency line directly at +91 98765 99999 or visit the clinic immediately.',
      quickReplies: [
        'Clinic Timings & Hours',
        'Book Appointment Tomorrow',
        'Doctor Specialization & Fees',
        'Clinic Location in Indiranagar',
      ],
    };
  }

  getNonTextReply(): OutgoingChannelMessage {
    return {
      text:
        'Thank you for reaching out to City Health Clinic. Our automated assistant currently accepts text messages only. Please type your query or appointment request as text, and we will be happy to assist you.',
    };
  }
}

export const telegramAdapter = new TelegramAdapter();
