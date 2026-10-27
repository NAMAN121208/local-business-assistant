// src/lib/orchestrator.ts
import { db } from './db';
import { Conversation, Customer, Message } from './db/types';
import { callLLM, LLMMessage, LLMResult } from './llm';
import {
  checkNeverAnswerTopic,
  classifySafetyWithLLM,
  isNeverAnswerTopic,
  retrieveRelevantKnowledge,
} from './kb';
import {
  checkAvailability,
  confirmBooking,
  getClinicNow,
  parseRelativeDate,
  parseTimeWindow,
} from './booking';
import { OutgoingMessage } from './channels';
import { detectLanguage, Dialect } from './locale/detector';
import { getLocalizedTemplate } from './locale/templates';

export interface ProcessMessageParams {
  businessId: string;
  channel?: string;
  conversationId?: string;
  customerId?: string;
  senderName?: string;
  senderContact?: string;
  text: string;
}

export async function processMessage(params: {
  businessId: string;
  channel?: string;
  conversationId?: string;
  customerId?: string;
  senderName?: string;
  senderContact?: string;
  text: string;
}): Promise<OutgoingMessage> {
  const { businessId, channel = 'web', senderName, senderContact } = params;
  const userText = params.text.trim();

  // 1. Detect customer language & script (English, Hindi Devanagari, Kannada script, Hinglish, Kanglish)
  const langDetection = detectLanguage(userText);
  const dialect: Dialect = langDetection.dialect;

  // 2. Identify or create Customer
  let customerId = params.customerId;
  if (!customerId) {
    if (senderContact) {
      const existing = await db.findCustomerByContact(businessId, senderContact);
      if (existing) customerId = existing.id;
    }
    if (!customerId) {
      customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.upsertCustomer({
        id: customerId,
        business_id: businessId,
        name: senderName || 'Patient',
        contact: senderContact || null,
        preferred_language: langDetection.language,
        first_seen_at: new Date().toISOString(),
      });
    }
  }

  // 3. Identify or create Conversation
  const conversation = await db.getOrCreateConversation(
    businessId,
    customerId,
    channel,
    params.conversationId
  );
  const convId = conversation.id;

  // If conversation was previously resolved, reopen it on new customer message
  if (conversation.status === 'resolved') {
    await db.updateConversationStatus(convId, 'open');
  }

  // 4. Save incoming customer message
  await db.createMessage({
    conversation_id: convId,
    sender: 'customer',
    text: userText,
    language: langDetection.language,
  });

  // 5. Check if conversation currently needs human intervention
  // Do not chatter over the owner if a human review is actively pending
  if (conversation.status === 'needs_human') {
    const holdingMsg = getLocalizedTemplate('needs_human_hold', dialect, {
      emergencyPhone: '+91 98765 99999',
    });
    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: holdingMsg,
      language: langDetection.language,
      provider: 'needs_human_hold',
      decision: 'escalate',
    });
    return {
      conversationId: convId,
      text: holdingMsg,
      decision: 'escalate',
      provider: 'needs_human_hold',
    };
  }

  // 6. Grounding & Multilingual Safety Guardrails
  const kbData = await retrieveRelevantKnowledge(businessId, userText);
  const now = getClinicNow('Asia/Kolkata');
  const emergencyPhone =
    kbData.facts.emergency_phone || kbData.facts.phone || '+91 98765 99999';

  // Strict Layer 1: Fast Multilingual Keyword & Regex Guardrails (EN, HI, KN)
  const neverAnswerCheck = checkNeverAnswerTopic(userText, kbData.neverAnswer);
  const isMedicalKeywordMatch = neverAnswerCheck.matched && neverAnswerCheck.isMedical;
  const isCustomPolicyMatch = neverAnswerCheck.matched && neverAnswerCheck.isCustomPolicy;

  // Strict Layer 2: LLM Safety Classification (if keyword did not flag, but message could be clinical)
  let isMedicalLLMMatch = false;
  let llmSafetyReason = '';
  if (!neverAnswerCheck.matched) {
    const safetyCheck = await classifySafetyWithLLM(userText);
    if (safetyCheck.isMedicalOrSensitive) {
      isMedicalLLMMatch = true;
      llmSafetyReason = safetyCheck.reason || 'Flagged by second-layer LLM clinical safety filter';
    }
  }

  if (isMedicalKeywordMatch || isMedicalLLMMatch) {
    const holdingReply = getLocalizedTemplate('medical_holding', dialect, {
      emergencyPhone,
    });

    await db.createEscalation({
      conversation_id: convId,
      reason: isMedicalKeywordMatch
        ? 'Medical advice or prescription requested (Layer 1 multilingual guardrail)'
        : `Medical safety escalation: ${llmSafetyReason} (Layer 2 LLM safety classifier)`,
      ai_summary: `Customer asked: "${userText.slice(0, 100)}..."`,
      suggested_reply:
        'Please advise patient to consult Dr. Sneha Rao at the clinic or visit emergency room if acute.',
      status: 'open',
    });

    await db.updateConversationStatus(convId, 'needs_human');

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: holdingReply,
      language: langDetection.language,
      intent: 'sensitive_or_out_of_scope',
      decision: 'escalate',
      confidence: 1.0,
      kb_refs: ['never_answer_medical_advice'],
      provider: isMedicalKeywordMatch
        ? 'deterministic_guardrail'
        : 'llm_safety_classifier',
    });

    return {
      conversationId: convId,
      text: holdingReply,
      decision: 'escalate',
      intent: 'sensitive_or_out_of_scope',
      provider: isMedicalKeywordMatch
        ? 'deterministic_guardrail'
        : 'llm_safety_classifier',
      quickReplies: ['Book Doctor Consultation', 'Clinic Hours', 'Emergency Contact'],
    };
  }

  if (isCustomPolicyMatch) {
    const pricingFaq = kbData.faqs.find((f) => f.keywords && f.keywords.includes('pricing'));
    const policyReply =
      pricingFaq?.answer ||
      `We do not discuss this topic over chat per clinic policy. Please call City Health Clinic directly at ${kbData.facts.phone || '+91 80 2525 0100'}.`;

    await db.createEscalation({
      conversation_id: convId,
      reason: `Prohibited topic per clinic policy: ${neverAnswerCheck.matchedRule}`,
      ai_summary: `Customer asked: "${userText.slice(0, 100)}..."`,
      suggested_reply: `Advise patient to call clinic at ${kbData.facts.phone || '+91 80 2525 0100'}.`,
      status: 'open',
    });

    await db.updateConversationStatus(convId, 'needs_human');

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: policyReply,
      language: langDetection.language,
      intent: 'sensitive_or_out_of_scope',
      decision: 'escalate',
      confidence: 1.0,
      kb_refs: ['never_answer_policy'],
      provider: 'deterministic_guardrail',
    });

    return {
      conversationId: convId,
      text: policyReply,
      decision: 'escalate',
      intent: 'sensitive_or_out_of_scope',
      provider: 'deterministic_guardrail',
      quickReplies: ['Call Clinic', 'Clinic Hours', 'Location'],
    };
  }

  // 7. Deterministic Multilingual Booking Engine & Slot Filling
  const lower = userText.toLowerCase();
  const history = await db.getRecentMessages(convId, 8);

  const isBookingQuery =
    /\b(book|appointment|apointment|slot|schedule|consultation|doctor|docter|dr\b|checkup|available|timings|milega|milenge|dikhana|dikha|chahiye|beku|ideya|sigutha|madalu)\b/i.test(
      userText
    );
  const targetDate = parseRelativeDate(userText, 'Asia/Kolkata');
  const timeWindow = parseTimeWindow(userText);

  if (isBookingQuery && targetDate) {
    const avail = await checkAvailability({
      businessId,
      service: 'General Physician Consultation',
      dateStr: targetDate,
      timeWindow,
    });

    let replyText = '';
    let quickReplies: string[] = [];

    if (avail.available && avail.slots.length > 0) {
      const slotList = avail.slots.map((s) => s.time).join(', ');
      replyText = getLocalizedTemplate('booking_slot_options', dialect, {
        date: avail.date,
        timeWindow: timeWindow === 'any' ? 'OPD hours' : timeWindow,
        slots: slotList,
      });
      quickReplies = avail.slots.map((s) => `Confirm ${s.time} on ${avail.date}`);
    } else {
      replyText =
        avail.reason ||
        getLocalizedTemplate('booking_unavailable', dialect, {
          date: avail.date,
        });
      quickReplies = ['Check Tomorrow', 'Clinic Hours', 'Call Clinic'];
    }

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: replyText,
      language: langDetection.language,
      intent: 'booking_create',
      decision: 'act',
      confidence: 1.0,
      kb_refs: ['booking_rules'],
      provider: 'deterministic_booking_engine',
    });

    return {
      conversationId: convId,
      text: replyText,
      decision: 'act',
      intent: 'booking_create',
      provider: 'deterministic_booking_engine',
      quickReplies,
    };
  }

  // Check if customer is confirming a proposed booking
  const confirmMatch = lower.match(
    /\b(confirm|yes\b|please book|book this|kardo|ha\b|haan\b|sari\b|hudu)\b.*?(?:(\d{1,2}:\d{2}\s*(?:am|pm)?)|(\d{1,2}\s*(?:am|pm)))?/i
  );
  const hasPendingBookingContext = history.some(
    (h) => h.sender === 'bot' && h.intent === 'booking_create' && (h.text.includes('slots') || h.text.includes('ಸ್ಲಾಟ್‌ಗಳು') || h.text.includes('स्लॉट'))
  );

  if (confirmMatch && hasPendingBookingContext) {
    const lastBotMsg = [...history]
      .reverse()
      .find((h) => h.sender === 'bot' && (h.text.includes('slots') || h.text.includes('ಸ್ಲಾಟ್‌ಗಳು') || h.text.includes('स्लॉट')));
    const dateMatch = lastBotMsg?.text.match(/(\d{4}-\d{2}-\d{2})/);
    const bookingDate = dateMatch ? dateMatch[1] : targetDate || now.dateStr;

    const slotTimeMatch =
      userText.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i) ||
      lastBotMsg?.text.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    const chosenTime = slotTimeMatch ? slotTimeMatch[1] : '10:00 AM';

    const booking = await confirmBooking({
      businessId,
      customerId,
      service: 'General Physician Consultation (Dr. Sneha Rao)',
      startTimeIso: `${bookingDate}T10:00:00.000Z`,
      endTimeIso: `${bookingDate}T10:30:00.000Z`,
      notes: `Booked via Web Chat for ${senderName || 'Patient'}`,
    });

    const confirmedReply = getLocalizedTemplate('booking_confirmed', dialect, {
      id: booking.id.toUpperCase(),
      service: 'General Physician Consultation (Dr. Sneha Rao)',
      date: bookingDate,
      time: chosenTime,
      location: 'City Health Clinic, 42 1st Main, Indiranagar',
    });

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: confirmedReply,
      language: langDetection.language,
      intent: 'booking_create',
      decision: 'act',
      confidence: 1.0,
      kb_refs: ['booking_rules'],
      provider: 'deterministic_booking_engine',
    });

    return {
      conversationId: convId,
      text: confirmedReply,
      decision: 'act',
      intent: 'booking_create',
      provider: 'deterministic_booking_engine',
      quickReplies: ['Location & Directions', 'Clinic Hours', 'Emergency Contact'],
    };
  }

  // 8. LLM Orchestrator Loop (for FAQs, general inquiries, intent grounding, and unknown topics)
  const systemPrompt = `You are the AI Front-Desk Assistant for "City Health Clinic" in Indiranagar, Bengaluru.
Current Local Date & Time: ${now.dateStr} ${now.timeStr} (Timezone: Asia/Kolkata).
Customer Language Detected: ${langDetection.language} (Dialect: ${dialect}, Script: ${langDetection.script}).

STRICT RULES:
1. ONLY answer questions using the clinic knowledge base below. NEVER invent prices, hours, doctor names, or facts.
2. MEDICAL SAFETY: NEVER provide medical advice, diagnosis, medicine recommendations, or dosages. If asked about medication or medical treatment, set decision="escalate" immediately.
3. If an inquiry cannot be answered from the knowledge base, set decision="escalate" and confidence=0.4.
4. LANGUAGE & SCRIPT: Reply in the EXACT language and script the customer used:
   - If Hindi Devanagari script was used, reply in Hindi Devanagari script.
   - If Kannada script was used, reply in Kannada script.
   - If Hinglish (Roman script) was used, reply in polite, natural Hinglish.
   - If Kanglish (Roman script) was used, reply in Kanglish or clear English.
   - If English, reply in English.
   - Exact numbers, dates, times, booking IDs, and emergency phone numbers must NEVER be altered or mistranslated.
5. Output valid JSON matching this exact structure:
{
  "intent": "faq" | "booking_create" | "booking_change_or_cancel" | "availability_check" | "greeting_or_smalltalk" | "complaint" | "sensitive_or_out_of_scope" | "unknown",
  "decision": "answer" | "act" | "escalate",
  "reply_text": "Customer reply in their language and script",
  "language": "en" | "hi" | "kn",
  "confidence": 0.0 to 1.0,
  "kb_refs": ["faq_hours", ...],
  "tool_calls": []
}

CLINIC KNOWLEDGE BASE:
Facts: ${JSON.stringify(kbData.facts)}
Services: ${JSON.stringify(kbData.services)}
FAQs: ${JSON.stringify(kbData.faqs)}
Booking Rules: ${JSON.stringify(kbData.bookingRules)}
Never Answer Rules: ${JSON.stringify(kbData.neverAnswer)}`;

  const conversationHistory: LLMMessage[] = history.map((m) => ({
    role: m.sender === 'bot' ? 'assistant' : 'user',
    content: m.text,
  }));

  let llmResult: LLMResult = await callLLM({
    systemPrompt,
    messages: [...conversationHistory, { role: 'user', content: userText }],
    temperature: 0.1,
  });

  // If LLM returned fallback (e.g. API keys not configured or cloud timeout)
  // Check if we have a direct high-confidence FAQ match in the knowledge base
  if (llmResult.provider === 'fallback') {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'you', 'your', 'have', 'are', 'what', 'where',
      'clinic', 'does', 'can', 'about', 'from', 'this', 'that', 'our', 'here',
      'their', 'they', 'which', 'who', 'how', 'when'
    ]);
    const queryTerms = userText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    if (kbData.faqs.length > 0 && queryTerms.length > 0) {
      let bestFaq = kbData.faqs[0];
      let maxMatches = 0;

      for (const faq of kbData.faqs) {
        const textToMatch = `${faq.question} ${faq.answer} ${(faq.keywords || []).join(' ')}`.toLowerCase();
        const matches = queryTerms.filter((term) => {
          try {
            return new RegExp(`\\b${term}\\b`, 'i').test(textToMatch);
          } catch {
            return textToMatch.includes(term);
          }
        }).length;

        if (matches > maxMatches) {
          maxMatches = matches;
          bestFaq = faq;
        }
      }

      const isConfidentMatch =
        (queryTerms.length <= 2 && maxMatches >= 1) || maxMatches >= 2;

      if (isConfidentMatch) {
        llmResult = {
          intent: 'faq',
          decision: 'answer',
          reply_text: bestFaq.answer,
          language: langDetection.language,
          confidence: 0.95,
          kb_refs: [bestFaq.id],
          tool_calls: [],
          provider: 'kb_direct',
        };
      } else {
        llmResult.intent = 'unknown';
        llmResult.decision = 'escalate';
        llmResult.confidence = 0.3;
        llmResult.reply_text = getLocalizedTemplate('safe_fallback', dialect);
      }
    } else {
      llmResult.intent = 'unknown';
      llmResult.decision = 'escalate';
      llmResult.confidence = 0.3;
      llmResult.reply_text = getLocalizedTemplate('safe_fallback', dialect);
    }
  }

  // Force escalation if confidence is low, or if decision is escalate, or if intent is complaint / sensitive / unknown
  const shouldEscalate =
    llmResult.decision === 'escalate' ||
    llmResult.confidence < 0.6 ||
    llmResult.intent === 'complaint' ||
    llmResult.intent === 'sensitive_or_out_of_scope' ||
    llmResult.intent === 'unknown';

  if (shouldEscalate) {
    await db.createEscalation({
      conversation_id: convId,
      reason:
        llmResult.intent === 'unknown'
          ? 'Question not covered in knowledge base'
          : `Escalated with intent: ${llmResult.intent} (confidence ${llmResult.confidence})`,
      ai_summary: `Customer message: "${userText}"`,
      suggested_reply: llmResult.reply_text || 'Clinic staff will review and contact you shortly.',
      status: 'open',
    });
    await db.updateConversationStatus(convId, 'needs_human');
  }

  // Save bot message to DB with provider logged
  await db.createMessage({
    conversation_id: convId,
    sender: 'bot',
    text: llmResult.reply_text,
    language: llmResult.language || langDetection.language,
    intent: llmResult.intent,
    decision: shouldEscalate ? 'escalate' : llmResult.decision,
    confidence: llmResult.confidence,
    kb_refs: llmResult.kb_refs,
    provider: llmResult.provider,
  });

  return {
    conversationId: convId,
    text: llmResult.reply_text,
    decision: shouldEscalate ? 'escalate' : llmResult.decision,
    intent: llmResult.intent,
    provider: llmResult.provider,
    quickReplies: shouldEscalate
      ? ['Talk to Staff', 'Emergency Contact', 'Clinic Timings']
      : ['Book Appointment', 'Clinic Hours', 'Location & Parking'],
  };
}
