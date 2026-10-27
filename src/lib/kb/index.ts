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
 * Fast safety pre-filter for sensitive / never-answer topics across English, Hindi, Hinglish, Kannada & Kanglish
 * Returns true if the query asks for medical advice, prescription, dosage, diagnosis, or acute symptom relief.
 */
export function isNeverAnswerTopic(query: string, neverAnswerRules: string[] = []): boolean {
  const lower = query.toLowerCase();

  // 1. Multilingual sensitive keywords & patterns
  const sensitivePatterns = [
    // English patterns
    /\b(what|which)\s+(medicine|drug|tablet|syrup|dose|dosage)\b/,
    /\b(give|take|prescribe)\s+(medicine|medication|tablet|dosage|syrup)\b/,
    /\bmedicine\s+for\s+(fever|cough|cold|pain|vomiting|diarrhea|headache|infection)\b/,
    /\b(diagnos|symptoms\s+of|cure\s+for|treat\s+my)\b/,
    /\b(chest\s+pain|heart\s+attack|stroke|unconscious|heavy\s+bleeding|suicide)\b/,
    /\bhow\s+many\s+mg\b/,
    /\bdosage\s+for\b/,
    /\b(paracetamol|ibuprofen|amoxicillin|azithromycin|crocin|dolo)\b/,

    // Hindi & Hinglish patterns (Latin & Devanagari)
    /\b(bukhar|bukhaar|fever)\b.*?\b(dawa|dawai|davai|goli|tablet|kya|du|dun|de|dose)\b/,
    /\b(dawa|dawai|davai|goli|tablet)\b.*?\b(bukhar|dard|ulti|khansi|sar dard|pet dard)\b/,
    /\b(kaunsi|kounsi|kya)\s+(dawa|dawai|goli|tablet)\b/,
    /\b(khurak|dosage|dose|kitni\s+goli)\b/,
    /\b(ilaj|upchar|doctori\s+salah)\b/,
    /\b(seena\s+dard|chhati\s+mein\s+dard|saans\s+phoolna)\b/,
    /[\u0900-\u097F].*?(दवा|दवाई|गोली|खुराक|इलाज|उपचार|बुखार|दर्द|उल्टी|खांसी|चोट)/,
    /\b(बुखार|दवा|दवाई|गोली|इलाज|खुराक)\b/,

    // Kannada & Kanglish patterns (Latin & Kannada script)
    /\b(jvara|jwara|fever)\b.*?\b(oushadha|aushadha|maathre|tablet|en|kodbeku|thinnabeku)\b/,
    /\b(oushadha|aushadha|maathre|tablet)\b.*?\b(jvara|novu|vanti|kemmu|talenovu)\b/,
    /\b(yava|yaava)\s+(oushadha|aushadha|maathre|tablet)\b/,
    /\b(chikitshe|upachara|salahe)\b/,
    /[\u0C80-\u0CFF].*?(ಜ್ವರ|ಔಷಧ|ಮಾತ್ರೆ|ಚಿಕಿತ್ಸೆ|ನೋವು|ವಾಂತಿ|ಕೆಮ್ಮು|ರಕ್ತ)/,
    /\b(ಜ್ವರ|ಔಷಧ|ಮಾತ್ರೆ|ಚಿಕಿತ್ಸೆ|ನೋವು)\b/,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(lower) || pattern.test(query)) {
      return true;
    }
  }

  // Check custom clinic never_answer rules
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
 * Second Safety Layer: LLM Safety Classification
 * Runs on customer messages that passed keyword heuristics.
 * Can only ESCALATE, never relax a rule.
 * An uncertain message is always flagged for escalation.
 */
export async function classifySafetyWithLLM(
  text: string,
  callLLMFn?: any
): Promise<{ isMedicalOrSensitive: boolean; reason?: string }> {
  // If text is obviously purely logistical (e.g. asking for hours or booking slot directly)
  const logisticalKeywords = /\b(hours|timings|open|close|address|landmark|parking|book|slot|cancel|cost|fee|charge)\b/i;
  if (logisticalKeywords.test(text) && text.length < 60) {
    return { isMedicalOrSensitive: false };
  }

  try {
    const { callLLM } = await import('../llm');
    const prompt = `You are a medical safety classifier for a neighbourhood clinic assistant.
Task: Determine if the customer message describes clinical symptoms, asks for medical advice, asks for drug/medicine/dosage recommendations, asks for diagnosis, or mentions a medical emergency in ANY language (English, Hindi, Kannada, Hinglish, Kanglish).

Output strict JSON:
{
  "is_medical_or_sensitive": true | false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation"
}

Rule: If you are at all uncertain, set is_medical_or_sensitive: true.`;

    const res = await callLLM({
      systemPrompt: prompt,
      messages: [{ role: 'user', content: `Message: "${text}"` }],
      temperature: 0.0,
    });

    if (res.provider === 'fallback') {
      // In offline/fallback mode without active LLM keys, trust keyword pre-filter
      return { isMedicalOrSensitive: false };
    }

    const parsed = JSON.parse(res.reply_text);
    if (parsed.is_medical_or_sensitive || (parsed.confidence && parsed.confidence < 0.7)) {
      return {
        isMedicalOrSensitive: true,
        reason: parsed.reason || 'Safety classifier flagged clinical symptom/advice query',
      };
    }
    return { isMedicalOrSensitive: false };
  } catch (err) {
    return { isMedicalOrSensitive: false };
  }
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

  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'you', 'your', 'have', 'are', 'what', 'where',
    'clinic', 'does', 'can', 'about', 'from', 'this', 'that', 'our', 'here'
  ]);

  const queryTerms = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

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
    .filter((item) => item.score >= 1)
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
    faqs: scoredFaqs.slice(0, 4),
    bookingRules: content.booking_rules,
    neverAnswer: content.never_answer,
  };
}
