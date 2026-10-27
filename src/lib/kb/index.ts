// src/lib/kb/index.ts
import { db } from '../db';
import { KnowledgeBaseContent, KnowledgeBaseVersion } from '../db/types';
import { demoClinicBusiness, demoClinicKBContent, demoClinicKBVersion, DEMO_CLINIC_ID } from './demo-clinic';

export * from './demo-clinic';

export async function initKnowledgeBase(): Promise<void> {
  const existing = await db.getBusiness(DEMO_CLINIC_ID);
  if (!existing) {
    await db.upsertBusiness(demoClinicBusiness);
    await db.saveKnowledgeBaseVersion(demoClinicKBVersion);

    // Seed a couple sample bookings so availability check demonstrates occupied slots
    // Let's seed a booking for today or tomorrow
    const todayStr = new Date().toISOString().split('T')[0];
    await db.createBooking({
      id: 'sample_bk_01',
      business_id: DEMO_CLINIC_ID,
      customer_id: 'cust_sample_1',
      service: 'General Physician Consultation',
      start_time: `${todayStr}T10:00:00.000Z`,
      end_time: `${todayStr}T10:30:00.000Z`,
      status: 'confirmed',
      notes: 'Routine BP checkup',
    });
  }
}

/**
 * Fast safety pre-filter for sensitive / never-answer topics
 * Returns true if the query asks for medical advice, prescription, or dangerous guidance.
 */
export function isNeverAnswerTopic(query: string, neverAnswerRules: string[] = []): boolean {
  const lower = query.toLowerCase();

  // Explicit medical advice / dosage / prescription patterns
  const sensitivePatterns = [
    /\b(what|which)\s+(medicine|drug|tablet|syrup|dose|dosage)\b/,
    /\b(give|take|prescribe)\s+(medicine|medication|tablet|dosage|syrup)\b/,
    /\bmedicine\s+for\s+(fever|cough|cold|pain|vomiting|diarrhea|headache|infection)\b/,
    /\b(diagnos|symptoms\s+of|cure\s+for|treat\s+my)\b/,
    /\b(chest\s+pain|heart\s+attack|stroke|unconscious|heavy\s+bleeding|suicide)\b/,
    /\bhow\s+many\s+mg\b/,
    /\bdosage\s+for\b/,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // Check custom rules
  for (const rule of neverAnswerRules) {
    const keywords = rule.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matches = keywords.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Grounding search: retrieves relevant FAQs, services, and business facts for a customer message
 */
export async function retrieveRelevantKnowledge(
  businessId: string,
  userMessage: string
): Promise<{
  facts: Record<string, any>;
  services: any[];
  faqs: any[];
  bookingRules: any;
  neverAnswer: string[];
}> {
  await initKnowledgeBase();
  const kb = await db.getLatestKnowledgeBase(businessId);
  const content = (kb?.content || demoClinicKBContent) as KnowledgeBaseContent;

  const queryTerms = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Score and filter FAQs
  const scoredFaqs = content.faqs
    .map((faq) => {
      let score = 0;
      const textToSearch = `${faq.question} ${faq.answer} ${(faq.keywords || []).join(' ')}`.toLowerCase();
      for (const term of queryTerms) {
        if (textToSearch.includes(term)) {
          score += 1;
        }
      }
      return { faq, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.faq);

  // Score and filter Services
  const scoredServices = content.services.filter((s) => {
    const text = `${s.name} ${s.description || ''}`.toLowerCase();
    return queryTerms.some((term) => text.includes(term));
  });

  return {
    facts: content.facts,
    services: scoredServices.length > 0 ? scoredServices : content.services,
    faqs: scoredFaqs.length > 0 ? scoredFaqs.slice(0, 4) : content.faqs.slice(0, 3),
    bookingRules: content.booking_rules,
    neverAnswer: content.never_answer,
  };
}
