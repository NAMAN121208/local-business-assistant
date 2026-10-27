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
  EscalationStatus,
  DailySummary,
  DailySummaryMetrics,
  UnansweredQuestionItem,
} from './types';

// In-memory fallback cache when Supabase credentials are not set (for local dev)
const memoryStore = {
  businesses: new Map<string, Business>(),
  kbVersions: new Map<string, KnowledgeBaseVersion[]>(),
  customers: new Map<string, Customer>(),
  conversations: new Map<string, Conversation>(),
  messages: new Map<string, Message[]>(),
  bookings: new Map<string, Booking>(),
  escalations: new Map<string, Escalation>(),
  dailySummaries: new Map<string, DailySummary>(),
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  const isProduction = process.env.NODE_ENV === 'production';
  const isMemoryPermitted = process.env.USE_MEMORY_DB === 'true';

  if (!url || !key) {
    if (isProduction && !isMemoryPermitted) {
      console.error(
        '[FATAL DB ERROR] Production environment requires Supabase credentials! SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be provided in Vercel environment variables.'
      );
    }
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
      const query = id
        ? this.supabase.from('businesses').select('*').eq('id', id).maybeSingle()
        : this.supabase.from('businesses').select('*').limit(1).maybeSingle();
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
  /**
   * Always loads the latest APPROVED knowledge base version.
   * Unapproved drafts are not used by the customer bot.
   */
  async getLatestKnowledgeBase(businessId: string): Promise<KnowledgeBaseVersion | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('knowledge_base_versions')
        .select('*')
        .eq('business_id', businessId)
        .eq('approved_by_owner', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) return data as KnowledgeBaseVersion;
    }
    const versions = (memoryStore.kbVersions.get(businessId) || []).filter(
      (v) => v.approved_by_owner === true
    );
    if (versions.length === 0) return null;
    return versions.reduce((prev, curr) => (curr.version > prev.version ? curr : prev));
  }

  async getAllKnowledgeBaseVersions(businessId: string): Promise<KnowledgeBaseVersion[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('knowledge_base_versions')
        .select('*')
        .eq('business_id', businessId)
        .order('version', { ascending: false });
      if (!error && data) return data as KnowledgeBaseVersion[];
    }
    const versions = memoryStore.kbVersions.get(businessId) || [];
    return [...versions].sort((a, b) => b.version - a.version);
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
      const { data, error } = await this.supabase.from('customers').select('*').eq('id', id).maybeSingle();
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
        .maybeSingle();
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
      const { data, error } = await this.supabase.from('conversations').select('*').eq('id', id).maybeSingle();
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

  async getAllConversations(
    businessId: string,
    filter?: { status?: ConversationStatus }
  ): Promise<Conversation[]> {
    if (this.supabase) {
      let query = this.supabase
        .from('conversations')
        .select('*')
        .eq('business_id', businessId)
        .order('updated_at', { ascending: false });
      if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      const { data, error } = await query;
      if (!error && data) return data as Conversation[];
    }
    const all = Array.from(memoryStore.conversations.values()).filter(
      (c) => c.business_id === businessId && (!filter?.status || c.status === filter.status)
    );
    return all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  // 7.3: Data purging for privacy compliance and maintenance
  async purgeConversations(
    businessId: string,
    olderThanDays?: number
  ): Promise<{ deletedCount: number }> {
    let cutoffIso: string | null = null;
    if (olderThanDays !== undefined && olderThanDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() - olderThanDays);
      cutoffIso = d.toISOString();
    }

    if (this.supabase) {
      let query = this.supabase
        .from('conversations')
        .select('id')
        .eq('business_id', businessId);
      if (cutoffIso) {
        query = query.lt('created_at', cutoffIso);
      }
      const { data: convs, error } = await query;
      if (error || !convs || convs.length === 0) return { deletedCount: 0 };

      const convIds = convs.map((c: any) => c.id);
      await this.supabase.from('messages').delete().in('conversation_id', convIds);
      await this.supabase.from('escalations').delete().in('conversation_id', convIds);
      const { error: delErr } = await this.supabase
        .from('conversations')
        .delete()
        .in('id', convIds);
      return { deletedCount: delErr ? 0 : convIds.length };
    }

    let deletedCount = 0;
    for (const [id, conv] of memoryStore.conversations.entries()) {
      if (conv.business_id === businessId) {
        if (!cutoffIso || conv.created_at < cutoffIso) {
          memoryStore.conversations.delete(id);
          memoryStore.messages.delete(id);
          deletedCount++;
        }
      }
    }
    return { deletedCount };
  }

  // --- MESSAGE ---
  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
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

  async createMessage(
    msg: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): Promise<Message> {
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

    // Touch conversation updated_at
    const conv = memoryStore.conversations.get(fullMsg.conversation_id);
    if (conv) {
      conv.updated_at = fullMsg.created_at;
    }
    return fullMsg;
  }

  // --- BOOKING ---
  async createBooking(
    booking: Omit<Booking, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): Promise<Booking> {
    const fullBooking: Booking = {
      id: booking.id || `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      business_id: booking.business_id,
      customer_id: booking.customer_id,
      service: booking.service,
      start_time: booking.start_time,
      end_time: booking.end_time,
      status: booking.status || 'confirmed',
      notes: booking.notes || null,
      is_read: false,
      created_at: booking.created_at || new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('bookings').insert(fullBooking).select().single();
      if (!error && data) return data as Booking;
    }

    memoryStore.bookings.set(fullBooking.id, fullBooking);
    return fullBooking;
  }

  async getBooking(id: string): Promise<Booking | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .ilike('id', id)
        .maybeSingle();
      if (!error && data) return data as Booking;
    }
    const idLower = id.toLowerCase();
    for (const [key, b] of memoryStore.bookings.entries()) {
      if (key.toLowerCase() === idLower || b.id.toLowerCase() === idLower) {
        return b;
      }
    }
    return null;
  }

  async findBookings(
    businessId: string,
    filters?: { date?: string; customerId?: string; status?: BookingStatus }
  ): Promise<Booking[]> {
    if (this.supabase) {
      let query = this.supabase
        .from('bookings')
        .select('*')
        .eq('business_id', businessId)
        .order('start_time', { ascending: true });
      if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
      if (filters?.status) query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (!error && data) {
        let res = data as Booking[];
        if (filters?.date) {
          res = res.filter((b) => b.start_time.startsWith(filters.date!));
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
    return list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
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

  async markBookingRead(id: string): Promise<void> {
    if (this.supabase) {
      await this.supabase.from('bookings').update({ is_read: true }).eq('id', id);
    }
    const b = memoryStore.bookings.get(id);
    if (b) {
      b.is_read = true;
    }
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
      is_read: false,
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
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async markEscalationRead(id: string): Promise<void> {
    if (this.supabase) {
      await this.supabase.from('escalations').update({ is_read: true }).eq('id', id);
    }
    const e = memoryStore.escalations.get(id);
    if (e) {
      e.is_read = true;
    }
  }

  async resolveEscalation(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase.from('escalations').update({ status: 'resolved', resolved_at: now }).eq('id', id);
    }
    const e = memoryStore.escalations.get(id);
    if (e) {
      e.status = 'resolved';
      e.resolved_at = now;
    }
  }

  // --- UNREAD & NOTIFICATION STATS ---
  async getOwnerDashboardStats(businessId: string): Promise<{
    needsHumanCount: number;
    unreadBookingsCount: number;
    unreadEscalationsCount: number;
    totalBookingsToday: number;
  }> {
    const conversations = (await this.getAllConversations(businessId)) || [];
    const needsHumanCount = conversations.filter((c) => c && c.status === 'needs_human').length;

    const escalations = (await this.getEscalations()) || [];
    const unreadEscalationsCount = escalations.filter((e) => e && e.status === 'open' && !e.is_read).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const bookings = (await this.findBookings(businessId)) || [];
    const unreadBookingsCount = bookings.filter((b) => b && !b.is_read).length;
    const totalBookingsToday = bookings.filter(
      (b) => b && b.start_time && b.start_time.startsWith(todayStr) && b.status === 'confirmed'
    ).length;

    return {
      needsHumanCount,
      unreadBookingsCount,
      unreadEscalationsCount,
      totalBookingsToday,
    };
  }

  // --- DAILY SUMMARY & ANALYTICS ---
  async saveDailySummary(summary: DailySummary): Promise<DailySummary> {
    if (this.supabase) {
      await this.supabase.from('daily_summaries').upsert({
        id: summary.id,
        business_id: summary.business_id,
        date: summary.date,
        metrics: summary.metrics,
        highlights: summary.highlights,
        unanswered_questions: summary.unanswered_questions,
        created_at: summary.created_at,
      });
    }
    const key = `${summary.business_id}_${summary.date}`;
    memoryStore.dailySummaries.set(key, summary);
    return summary;
  }

  async getDailySummary(businessId: string, date: string): Promise<DailySummary | null> {
    if (this.supabase) {
      const { data } = await this.supabase
        .from('daily_summaries')
        .select('*')
        .eq('business_id', businessId)
        .eq('date', date)
        .maybeSingle();
      if (data) return data as DailySummary;
    }
    const key = `${businessId}_${date}`;
    return memoryStore.dailySummaries.get(key) || null;
  }

  async getRecentDailySummaries(businessId: string, limit: number = 7): Promise<DailySummary[]> {
    if (this.supabase) {
      const { data } = await this.supabase
        .from('daily_summaries')
        .select('*')
        .eq('business_id', businessId)
        .order('date', { ascending: false })
        .limit(limit);
      if (data) return data as DailySummary[];
    }
    const summaries = Array.from(memoryStore.dailySummaries.values())
      .filter((s) => s.business_id === businessId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
    return summaries;
  }

  async computeDailyMetrics(businessId: string, targetDateStr: string): Promise<{
    metrics: DailySummaryMetrics;
    unansweredQuestions: UnansweredQuestionItem[];
  }> {
    const allConvs = (await this.getAllConversations(businessId)) || [];
    const dateConvs = allConvs.filter(
      (c) => c && (c.created_at?.startsWith(targetDateStr) || c.updated_at?.startsWith(targetDateStr))
    );

    const allBookings = (await this.findBookings(businessId)) || [];
    const dateBookings = allBookings.filter(
      (b) => b && (b.created_at?.startsWith(targetDateStr) || b.start_time?.startsWith(targetDateStr))
    );
    const bookingsCreated = dateBookings.length;
    const bookingsCancelled = dateBookings.filter((b) => b.status === 'cancelled').length;

    const allEscalations = (await this.getEscalations()) || [];
    const dateEscalations = allEscalations.filter((e) => e && e.created_at?.startsWith(targetDateStr));
    const openEscalations = dateEscalations.filter((e) => e.status === 'open').length;

    // Aggregate messages from conversations active today
    const intentCounts: Record<string, number> = {};
    const questionCounts: Record<string, number> = {};
    const unansweredQuestions: UnansweredQuestionItem[] = [];

    let totalConversations = dateConvs.length;
    let escalatedConvsCount = 0;

    for (const conv of dateConvs) {
      const msgs = (await this.getRecentMessages(conv.id, 50)) || [];
      const isEscalated =
        conv.status === 'needs_human' ||
        msgs.some(
          (m) =>
            m.decision === 'escalate' ||
            (m.sender === 'bot' && m.intent === 'sensitive_or_out_of_scope')
        );

      if (isEscalated) escalatedConvsCount++;

      for (const m of msgs) {
        if (m.sender === 'customer') {
          const qText = m.text.trim();
          questionCounts[qText] = (questionCounts[qText] || 0) + 1;
        }
        if (m.intent) {
          intentCounts[m.intent] = (intentCounts[m.intent] || 0) + 1;
        }
        if (m.decision === 'escalate' || m.intent === 'unknown') {
          const custMsg = msgs.find((x) => x.sender === 'customer');
          unansweredQuestions.push({
            conversationId: conv.id,
            question: custMsg?.text || 'Unresolved customer query',
            reason:
              m.intent === 'unknown'
                ? 'Unknown topic not covered in KB'
                : 'Escalated to human staff',
            createdAt: m.created_at,
          });
        }
      }
    }

    if (totalConversations === 0 && (bookingsCreated > 0 || dateEscalations.length > 0)) {
      totalConversations = Math.max(bookingsCreated, dateEscalations.length);
    }

    const autoResolvedCount = Math.max(0, totalConversations - escalatedConvsCount);
    const autoResolvedPercent =
      totalConversations > 0 ? Math.round((autoResolvedCount / totalConversations) * 100) : 100;
    const escalatedPercent =
      totalConversations > 0 ? Math.round((escalatedConvsCount / totalConversations) * 100) : 0;

    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topQuestions = Object.entries(questionCounts)
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      metrics: {
        totalConversations,
        bookingsCreated,
        bookingsCancelled,
        openEscalations,
        autoResolvedCount,
        autoResolvedPercent,
        escalatedCount: escalatedConvsCount,
        escalatedPercent,
        topIntents,
        topQuestions,
      },
      unansweredQuestions: unansweredQuestions.slice(0, 10),
    };
  }
}

export const db = new DBClient();
