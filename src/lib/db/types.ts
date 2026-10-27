// src/lib/db/types.ts

export interface Business {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  emergency_phone?: string | null;
  timezone: string;
  languages: string[];
  tone: string;
  created_at: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  duration_mins: number;
  price?: number;
  description?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  keywords?: string[];
}

export interface BookingRules {
  slot_length_mins: number;
  capacity_per_slot: number;
  working_days: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  working_hours: {
    start: string; // "09:00"
    end: string;   // "19:00"
    break_start?: string; // "13:00"
    break_end?: string;   // "14:00"
  };
  lead_time_hours: number;
  cancel_lead_hours: number;
  cancellation_policy: string;
}

export interface KnowledgeBaseContent {
  facts: {
    name: string;
    type: string;
    address: string;
    phone: string;
    emergency_phone?: string;
    hours: Record<string, string>;
    consulting_doctors?: string[];
    specialties?: string[];
    landmark?: string;
    payment_methods?: string;
    parking?: string;
    [key: string]: any;
  };
  services: ServiceItem[];
  faqs: FAQItem[];
  booking_rules: BookingRules;
  escalation_rules: string[];
  never_answer: string[];
  holidays: string[]; // YYYY-MM-DD
  tone?: string;
}

export interface KnowledgeBaseVersion {
  id: string;
  business_id: string;
  version: number;
  content: KnowledgeBaseContent;
  raw_source_text?: string | null;
  approved_by_owner: boolean;
  missing_info?: string[];
  changelog?: any[];
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name?: string | null;
  contact?: string | null;
  preferred_language: string;
  first_seen_at: string;
}

export type ConversationStatus = 'open' | 'resolved' | 'needs_human';

export interface Conversation {
  id: string;
  business_id: string;
  customer_id: string;
  channel: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export type MessageSender = 'customer' | 'bot' | 'owner';
export type MessageIntent =
  | 'faq'
  | 'booking_create'
  | 'booking_change_or_cancel'
  | 'availability_check'
  | 'greeting_or_smalltalk'
  | 'complaint'
  | 'sensitive_or_out_of_scope'
  | 'unknown';

export type DecisionType = 'answer' | 'act' | 'escalate';

export interface Message {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  text: string;
  language: string;
  intent?: MessageIntent | null;
  decision?: DecisionType | null;
  confidence?: number;
  kb_refs?: string[];
  tool_calls?: any[];
  provider?: string | null;
  created_at: string;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  business_id: string;
  customer_id: string;
  service: string;
  start_time: string; // ISO
  end_time: string;   // ISO
  status: BookingStatus;
  notes?: string | null;
  is_read?: boolean;
  created_at: string;
}

export type EscalationStatus = 'open' | 'resolved';

export interface Escalation {
  id: string;
  conversation_id: string;
  reason: string;
  ai_summary: string;
  suggested_reply: string;
  status: EscalationStatus;
  is_read?: boolean;
  resolved_at?: string | null;
  created_at: string;
}
