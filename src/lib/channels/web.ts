// src/lib/channels/web.ts
import { processMessage } from '../orchestrator';
import {
  ChannelAdapter,
  ChannelSendResult,
  ChannelVerificationResult,
  IncomingMessageParsed,
  OutgoingChannelMessage,
} from './types';

export class WebChatAdapter implements ChannelAdapter {
  readonly channel: 'web' = 'web';

  async verifyRequest(): Promise<ChannelVerificationResult> {
    return { valid: true, status: 200 };
  }

  async parseIncoming(
    _req: Request | any,
    body: any
  ): Promise<IncomingMessageParsed | null> {
    if (!body || typeof body !== 'object' || !body.text) return null;
    const senderId = body.customerId || `web_user_${Date.now()}`;
    return {
      channel: 'web',
      senderId,
      messageId: `web_msg_${Date.now()}`,
      text: String(body.text).trim(),
      displayName: body.senderName,
      phone: body.senderContact,
      rawPayload: body,
    };
  }

  async send(
    _recipientId: string,
    _message: OutgoingChannelMessage
  ): Promise<ChannelSendResult> {
    // In Web Chat, messages are returned synchronously in HTTP responses
    return { success: true };
  }

  /**
   * Backwards compatible helper for existing web chat route
   */
  async receive(msg: {
    channel?: string;
    businessId: string;
    conversationId?: string;
    customerId?: string;
    senderName?: string;
    senderContact?: string;
    text: string;
  }) {
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
