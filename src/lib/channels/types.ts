// src/lib/channels/types.ts

export type ChannelType = 'web' | 'telegram' | 'whatsapp';

export interface IncomingMessage {
  channel: ChannelType;
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

export interface IncomingMessageParsed {
  channel: ChannelType;
  senderId: string;
  messageId: string;
  text: string;
  displayName?: string;
  phone?: string;
  rawPayload?: any;
  isNonTextMessage?: boolean;
  nonTextType?: string; // 'photo' | 'voice' | 'sticker' | 'video' | 'document' etc.
  isStartCommand?: boolean;
  isContactShare?: boolean;
  timestamp?: number; // Epoch ms
}

export interface OutgoingChannelMessage {
  text: string;
  quickReplies?: string[];
  metadata?: Record<string, any>;
}

export interface ChannelVerificationResult {
  valid: boolean;
  status: number;
  error?: string;
  challenge?: string; // For WhatsApp GET subscription verification
}

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelAdapter {
  readonly channel: ChannelType;

  /**
   * Validates webhooks (signature, secret token, or headers)
   */
  verifyRequest(
    req: Request | any,
    rawBody?: string
  ): Promise<ChannelVerificationResult>;

  /**
   * Normalizes platform payloads into standard IncomingMessageParsed
   */
  parseIncoming(
    req: Request | any,
    body: any
  ): Promise<IncomingMessageParsed | null>;

  /**
   * Sends reply back to user on this platform
   */
  send(
    recipientId: string,
    message: OutgoingChannelMessage
  ): Promise<ChannelSendResult>;
}
