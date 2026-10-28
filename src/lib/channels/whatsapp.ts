// src/lib/channels/whatsapp.ts
import crypto from 'crypto';
import {
  ChannelAdapter,
  ChannelSendResult,
  ChannelVerificationResult,
  IncomingMessageParsed,
  OutgoingChannelMessage,
} from './types';

// In-memory cache tracking the latest user inbound message timestamp per sender (epoch ms)
// Used to enforce Meta's 24-hour customer service window policy for free-text messages
const lastInboundUserTimestamps = new Map<string, number>();

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel: 'whatsapp' = 'whatsapp';

  private getVerifyToken(): string | undefined {
    return process.env.WHATSAPP_VERIFY_TOKEN;
  }

  private getAppSecret(): string | undefined {
    return process.env.WHATSAPP_APP_SECRET;
  }

  private getPhoneNumberId(): string | undefined {
    return process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  private getAccessToken(): string | undefined {
    return process.env.WHATSAPP_ACCESS_TOKEN;
  }

  /**
   * Validates required configuration.
   * Returns false if any required WhatsApp environment variable is missing.
   */
  isConfigured(): boolean {
    return Boolean(
      this.getVerifyToken() &&
      this.getAppSecret() &&
      this.getPhoneNumberId() &&
      this.getAccessToken()
    );
  }

  /**
   * Verifies GET webhook subscription request from Meta Developer Dashboard
   */
  verifySubscription(
    mode: string | null,
    verifyToken: string | null,
    challenge: string | null
  ): ChannelVerificationResult {
    const configuredToken = this.getVerifyToken();
    if (!configuredToken) {
      return {
        valid: false,
        status: 503,
        error: 'WhatsApp integration is not configured',
      };
    }

    if (mode === 'subscribe' && verifyToken === configuredToken && challenge) {
      return {
        valid: true,
        status: 200,
        challenge,
      };
    }

    return {
      valid: false,
      status: 403,
      error: 'Forbidden: Subscription verification failed',
    };
  }

  /**
   * Validates incoming POST payload signature using constant-time comparison
   * Signature Header: X-Hub-Signature-256: sha256=<hash>
   */
  async verifyRequest(
    req: Request | any,
    rawBody?: string
  ): Promise<ChannelVerificationResult> {
    if (!this.isConfigured()) {
      return {
        valid: false,
        status: 503,
        error: 'WhatsApp integration is not configured (missing environment variables)',
      };
    }

    const appSecret = this.getAppSecret()!;
    const signatureHeader =
      (typeof req.headers?.get === 'function'
        ? req.headers.get('x-hub-signature-256')
        : req.headers?.['x-hub-signature-256']) || '';

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return {
        valid: false,
        status: 401,
        error: 'Missing or malformed X-Hub-Signature-256 header',
      };
    }

    if (!rawBody) {
      return {
        valid: false,
        status: 400,
        error: 'Missing raw payload body for signature validation',
      };
    }

    const signature = signatureHeader.slice(7).trim(); // remove 'sha256='
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return {
        valid: false,
        status: 403,
        error: 'Forbidden: Invalid X-Hub-Signature-256 signature',
      };
    }

    return { valid: true, status: 200 };
  }

  /**
   * Parses WhatsApp Cloud API webhook JSON payload into normalized IncomingMessageParsed
   */
  async parseIncoming(
    _req: Request | any,
    body: any
  ): Promise<IncomingMessageParsed | null> {
    if (!body || typeof body !== 'object') return null;

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message) {
      // Status updates (sent, delivered, read) or system pings
      return null;
    }

    const senderPhone = (message.from || '').replace(/\D/g, '');
    if (!senderPhone) return null;

    const messageId = String(message.id || `wamid_${Date.now()}`);
    const contact = change?.contacts?.[0];
    const displayName = contact?.profile?.name || `WhatsApp User (+${senderPhone})`;

    // Record inbound message timestamp for 24-hr customer service window tracking
    const messageTimestamp = message.timestamp
      ? parseInt(message.timestamp, 10) * 1000
      : Date.now();
    lastInboundUserTimestamps.set(senderPhone, messageTimestamp);

    // 1. Text Message
    if (message.type === 'text' && message.text?.body) {
      return {
        channel: 'whatsapp',
        senderId: senderPhone,
        messageId,
        text: message.text.body.trim(),
        displayName,
        phone: senderPhone,
        rawPayload: body,
        timestamp: messageTimestamp,
      };
    }

    // 2. Interactive Reply (Quick reply buttons or list menu selections)
    if (message.type === 'interactive') {
      const buttonReply = message.interactive?.button_reply;
      const listReply = message.interactive?.list_reply;
      const selectedText = buttonReply?.title || listReply?.title || buttonReply?.id || listReply?.id || '';
      return {
        channel: 'whatsapp',
        senderId: senderPhone,
        messageId,
        text: selectedText.trim(),
        displayName,
        phone: senderPhone,
        rawPayload: body,
        timestamp: messageTimestamp,
      };
    }

    // 3. Non-Text Messages (images, audio, voice, video, document, sticker, location)
    const nonTextType = message.type || 'unknown';
    return {
      channel: 'whatsapp',
      senderId: senderPhone,
      messageId,
      text: '',
      displayName,
      phone: senderPhone,
      rawPayload: body,
      isNonTextMessage: true,
      nonTextType,
      timestamp: messageTimestamp,
    };
  }

  /**
   * Sends reply back to patient via WhatsApp Cloud API (Graph API)
   * Respects 24-hour service window and formats interactive buttons/lists
   */
  async send(
    recipientPhone: string,
    message: OutgoingChannelMessage
  ): Promise<ChannelSendResult> {
    const phoneNumberId = this.getPhoneNumberId();
    const accessToken = this.getAccessToken();

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        error: 'WhatsApp credentials not configured',
      };
    }

    const cleanRecipient = recipientPhone.replace(/\D/g, '');

    // 24-Hour Customer Service Window check per Meta Policy
    const lastUserTimestamp =
      message.metadata?.lastUserMessageTime ||
      lastInboundUserTimestamps.get(cleanRecipient);

    const now = Date.now();
    if (lastUserTimestamp && now - lastUserTimestamp > 24 * 60 * 60 * 1000) {
      console.warn(
        `[WhatsApp] 24-hour customer service window expired for recipient ${cleanRecipient.slice(-4)}. Free-text message skipped.`
      );
      return {
        success: false,
        error: '24-hour customer service window expired',
      };
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    let payload: any;

    const quickReplies = message.quickReplies || [];

    // Format Interactive Messages:
    // 1 to 3 items -> WhatsApp Interactive Reply Buttons
    if (quickReplies.length > 0 && quickReplies.length <= 3) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: message.text,
          },
          action: {
            buttons: quickReplies.map((qr, idx) => ({
              type: 'reply',
              reply: {
                id: `btn_${idx}_${Date.now()}`,
                // Meta enforces max 20 chars for quick reply button titles
                title: qr.length > 20 ? `${qr.slice(0, 17)}...` : qr,
              },
            })),
          },
        },
      };
    }
    // More than 3 items (up to 10) -> WhatsApp Interactive List Menu
    else if (quickReplies.length > 3) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: 'City Health Clinic',
          },
          body: {
            text: message.text,
          },
          action: {
            button: 'Select Slot',
            sections: [
              {
                title: 'Available Options',
                rows: quickReplies.slice(0, 10).map((qr, idx) => ({
                  id: `opt_${idx}_${Date.now()}`,
                  title: qr.length > 24 ? `${qr.slice(0, 21)}...` : qr,
                  description: qr.length > 24 ? qr.slice(0, 72) : undefined,
                })),
              },
            ],
          },
        },
      };
    }
    // Standard text message
    else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'text',
        text: {
          preview_url: false,
          body: message.text,
        },
      };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        return {
          success: false,
          error: `WhatsApp API Error: ${errMsg}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      const sentMsgId = data?.messages?.[0]?.id;
      return {
        success: true,
        messageId: sentMsgId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error delivering to WhatsApp API',
      };
    }
  }

  getNonTextReply(): OutgoingChannelMessage {
    return {
      text:
        'Thank you for contacting City Health Clinic. Our automated assistant currently accepts text messages only. Please reply with text to check clinic timings, fees, or schedule an appointment.',
    };
  }

  /**
   * Helper for tests to record or clear user inbound timestamps
   */
  setInboundTimestamp(senderPhone: string, timestamp: number): void {
    lastInboundUserTimestamps.set(senderPhone.replace(/\D/g, ''), timestamp);
  }

  clearInboundTimestamps(): void {
    lastInboundUserTimestamps.clear();
  }
}

export const whatsAppAdapter = new WhatsAppAdapter();
