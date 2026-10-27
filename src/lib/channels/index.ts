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
