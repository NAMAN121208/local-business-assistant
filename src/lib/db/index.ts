// src/lib/db/index.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Business,
  KnowledgeBaseVersion,
  Customer,
  Conversation,
  Message,
  Booking,
  Escalation,
  ConversationStatus,
  BookingStatus,
} from './types';

// In-memory fallback cache when Supabase credentials are not set
const memoryStore = {
  businesses: new Map<string, Business>(),
  kbVersions: new Map<string, KnowledgeBaseVersion[]>(),
  customers: new Map<string, Customer>(),
  conversations: new Map<string, Conversation>(),
  messages: new Map<string, Message[]>(),
  bookings: new Map<string, Booking>(),
  escalations: new Map<string, Escalation>(),
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export class DBClient {
  private supabase: SupabaseClient | null;

  constructor() {
    this.supabase = getSupabase();
  }

  // --- BUSINESS ---
  async getBusiness(id?: string): Promise<Business | null> {
    if (this.supabase) {
      const query = id ? this.supabase.from('businesses').select('*').eq('id', id).single() : this.supabase.from('businesses').select('*').limit(1).single();
      const { data, error } = await query;
      if (!error && data) return data as Business;
    }
    if (id) {
      return memoryStore.businesses.get(id) || null;
    }
    const all = Array.from(memoryStore.businesses.values());
    return all.length > 0 ? all[0] : null;
  }

  async upsertBusiness(biz: Business): Promise<Business> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('businesses')
        .upsert(biz)
        .select()
        .single();
      if (!error && data) return data as Business;
    }
    memoryStore.businesses.set(biz.id, biz);
    return biz;
  }

  // --- KNOWLEDGE BASE ---
  async getLatestKnowledgeBase(businessId: string): Promise<KnowledgeBaseVersion | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('knowledge_base_versions')
        .select('*')
        .eq('business_id', businessId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) return data as KnowledgeBaseVersion;
    }
    const versions = memoryStore.kbVersions.get(businessId) || [];
    if (versions.length === 0) return null;
    return versions.reduce((prev, curr) => (curr.version > prev.version ? curr : prev));
  }

  async saveKnowledgeBaseVersion(kb: KnowledgeBaseVersion): Promise<KnowledgeBaseVersion> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('knowledge_base_versions')
        .insert(kb)
        .select()
        .single();
      if (!error && data) return data as KnowledgeBaseVersion;
    }
    const existing = memoryStore.kbVersions.get(kb.business_id) || [];
    existing.push(kb);
    memoryStore.kbVersions.set(kb.business_id, existing);
    return kb;
  }

  // --- CUSTOMER ---
  async getCustomer(id: string): Promise<Customer | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase.from('customers').select('*').eq('id', id).single();
      if (!error && data) return data as Customer;
    }
    return memoryStore.customers.get(id) || null;
  }

  async findCustomerByContact(businessId: string, contact: string): Promise<Customer | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .eq('contact', contact)
        .limit(1)
        .single();
      if (!error && data) return data as Customer;
    }
    for (const cust of memoryStore.customers.values()) {
      if (cust.business_id === businessId && cust.contact === contact) {
        return cust;
      }
    }
    return null;
  }

  async upsertCustomer(cust: Customer): Promise<Customer> {
    if (this.supabase) {
      const { data, error } = await this.supabase.from('customers').upsert(cust).select().single();
      if (!error && data) return data as Customer;
    }
    memoryStore.customers.set(cust.id, cust);
    return cust;
  }

  // --- CONVERSATION ---
  async getConversation(id: string): Promise<Conversation | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase.from('conversations').select('*').eq('id', id).single();
      if (!error && data) return data as Conversation;
    }
    return memoryStore.conversations.get(id) || null;
  }

  async getOrCreateConversation(
    businessId: string,
    customerId: string,
    channel: string = 'web',
    forceId?: string
  ): Promise<Conversation> {
    if (forceId) {
      const existing = await this.getConversation(forceId);
      if (existing) return existing;
    }

    const convId = forceId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const conv: Conversation = {
      id: convId,
      business_id: businessId,
      customer_id: customerId,
      channel,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('conversations').upsert(conv).select().single();
      if (!error && data) return data as Conversation;
    }

    memoryStore.conversations.set(conv.id, conv);
    return conv;
  }

  async updateConversationStatus(id: string, status: ConversationStatus): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase.from('conversations').update({ status, updated_at: now }).eq('id', id);
    }
    const conv = memoryStore.conversations.get(id);
    if (conv) {
      conv.status = status;
      conv.updated_at = now;
      memoryStore.conversations.set(id, conv);
    }
  }

  // --- MESSAGE ---
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (!error && data) return data as Message[];
    }
    const list = memoryStore.messages.get(conversationId) || [];
    return list.slice(-limit);
  }

  async createMessage(msg: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }): Promise<Message> {
    const fullMsg: Message = {
      id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversation_id: msg.conversation_id,
      sender: msg.sender,
      text: msg.text,
      language: msg.language || 'en',
      intent: msg.intent || null,
      decision: msg.decision || null,
      confidence: msg.confidence ?? 1.0,
      kb_refs: msg.kb_refs || [],
      tool_calls: msg.tool_calls || [],
      provider: msg.provider || null,
      created_at: msg.created_at || new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('messages').insert(fullMsg).select().single();
      if (!error && data) return data as Message;
    }

    const list = memoryStore.messages.get(fullMsg.conversation_id) || [];
    list.push(fullMsg);
    memoryStore.messages.set(fullMsg.conversation_id, list);
    return fullMsg;
  }

  // --- BOOKING ---
  async createBooking(booking: Omit<Booking, 'id' | 'created_at'> & { id?: string; created_at?: string }): Promise<Booking> {
    const fullBooking: Booking = {
      id: booking.id || `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      business_id: booking.business_id,
      customer_id: booking.customer_id,
      service: booking.service,
      start_time: booking.start_time,
      end_time: booking.end_time,
      status: booking.status || 'confirmed',
      notes: booking.notes || null,
      created_at: booking.created_at || new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('bookings').insert(fullBooking).select().single();
      if (!error && data) return data as Booking;
    }

    memoryStore.bookings.set(fullBooking.id, fullBooking);
    return fullBooking;
  }

  async findBookings(
    businessId: string,
    filters?: { date?: string; customerId?: string; status?: BookingStatus }
  ): Promise<Booking[]> {
    if (this.supabase) {
      let query = this.supabase.from('bookings').select('*').eq('business_id', businessId);
      if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
      if (filters?.status) query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (!error && data) {
        let res = data as Booking[];
        if (filters?.date) {
          res = res.filter(b => b.start_time.startsWith(filters.date!));
        }
        return res;
      }
    }

    const list: Booking[] = [];
    for (const b of memoryStore.bookings.values()) {
      if (b.business_id !== businessId) continue;
      if (filters?.customerId && b.customer_id !== filters.customerId) continue;
      if (filters?.status && b.status !== filters.status) continue;
      if (filters?.date && !b.start_time.startsWith(filters.date)) continue;
      list.push(b);
    }
    return list;
  }

  async cancelBooking(id: string): Promise<boolean> {
    if (this.supabase) {
      const { error } = await this.supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
      if (!error) return true;
    }
    const b = memoryStore.bookings.get(id);
    if (b) {
      b.status = 'cancelled';
      memoryStore.bookings.set(id, b);
      return true;
    }
    return false;
  }

  // --- ESCALATION ---
  async createEscalation(
    esc: Omit<Escalation, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): Promise<Escalation> {
    const fullEsc: Escalation = {
      id: esc.id || `esc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversation_id: esc.conversation_id,
      reason: esc.reason,
      ai_summary: esc.ai_summary,
      suggested_reply: esc.suggested_reply,
      status: esc.status || 'open',
      resolved_at: esc.resolved_at || null,
      created_at: esc.created_at || new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('escalations').insert(fullEsc).select().single();
      if (!error && data) return data as Escalation;
    }

    memoryStore.escalations.set(fullEsc.id, fullEsc);
    return fullEsc;
  }

  async getEscalations(conversationId?: string): Promise<Escalation[]> {
    if (this.supabase) {
      let query = this.supabase.from('escalations').select('*').order('created_at', { ascending: false });
      if (conversationId) query = query.eq('conversation_id', conversationId);
      const { data, error } = await query;
      if (!error && data) return data as Escalation[];
    }
    const list: Escalation[] = [];
    for (const esc of memoryStore.escalations.values()) {
      if (conversationId && esc.conversation_id !== conversationId) continue;
      list.push(esc);
    }
    return list;
  }
}

export const db = new DBClient();
