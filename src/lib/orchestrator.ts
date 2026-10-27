// src/lib/orchestrator.ts
import { db } from './db';
import { Conversation, Customer, Message } from './db/types';
import { callLLM, LLMMessage, LLMResult } from './llm';
import { isNeverAnswerTopic, retrieveRelevantKnowledge } from './kb';
import { checkAvailability, confirmBooking, getClinicNow, parseRelativeDate } from './booking';
import { OutgoingMessage } from './channels';

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

  // 1. Identify or create Customer
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
        preferred_language: 'en',
        first_seen_at: new Date().toISOString(),
      });
    }
  }

  // 2. Identify or create Conversation
  const conversation = await db.getOrCreateConversation(businessId, customerId, channel, params.conversationId);
  const convId = conversation.id;

  // If conversation was previously resolved, reopen it on new customer message
  if (conversation.status === 'resolved') {
    await db.updateConversationStatus(convId, 'open');
  }

  // 3. Save incoming customer message
  await db.createMessage({
    conversation_id: convId,
    sender: 'customer',
    text: userText,
    language: 'en',
  });

  // 4. Check if conversation currently needs human intervention
  // Do not chatter over the owner if a human review is actively pending
  if (conversation.status === 'needs_human') {
    const holdingMsg =
      'Thank you. Our clinic staff is already reviewing your thread and will reply shortly. For urgent care, please call +91 98765 99999.';
    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: holdingMsg,
      language: 'en',
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

  // 5. Grounding & Safety pre-check
  const kbData = await retrieveRelevantKnowledge(businessId, userText);
  const now = getClinicNow('Asia/Kolkata');

  // Strict guardrail: Never give medical advice, dosages or diagnose
  if (isNeverAnswerTopic(userText, kbData.neverAnswer)) {
    const holdingReply =
      'City Health Clinic does not provide medical prescriptions or clinical diagnosis over chat. For urgent symptoms or emergency care, please contact our 24/7 emergency line at +91 98765 99999 or visit the clinic immediately. If you would like to book a doctor consultation, I can assist you.';

    await db.createEscalation({
      conversation_id: convId,
      reason: 'Medical advice or sensitive topic requested (never-answer safety rule)',
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
      language: 'en',
      intent: 'sensitive_or_out_of_scope',
      decision: 'escalate',
      confidence: 1.0,
      kb_refs: ['never_answer_medical_advice'],
      provider: 'deterministic_guardrail',
    });

    return {
      conversationId: convId,
      text: holdingReply,
      decision: 'escalate',
      intent: 'sensitive_or_out_of_scope',
      provider: 'deterministic_guardrail',
      quickReplies: ['Book Doctor Consultation', 'Clinic Hours', 'Emergency Contact'],
    };
  }

  // 6. Deterministic Booking Detection & Slot Filling
  const lower = userText.toLowerCase();
  const history = await db.getRecentMessages(convId, 8);

  // Check if user is asking for availability or booking in English or Hinglish
  const isBookingQuery =
    /\b(book|appointment|slot|schedule|consultation|doctor|available|timings|milega|milenge|dikhana|dikha)\b/i.test(
      userText
    );
  const targetDate = parseRelativeDate(userText, 'Asia/Kolkata');

  if (isBookingQuery && targetDate) {
    const timeWindow =
      lower.includes('morning') || lower.includes('subah')
        ? 'morning'
        : lower.includes('evening') || lower.includes('shaam')
        ? 'evening'
        : 'any';

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
      replyText = `We have slots available for Dr. Consultation on ${avail.date} (${
        timeWindow === 'any' ? 'OPD hours' : timeWindow
      }): ${slotList}. Would you like to confirm one of these slots? Please reply with your preferred time and your name.`;
      quickReplies = avail.slots.map((s) => `Confirm ${s.time} on ${avail.date}`);
    } else {
      replyText =
        avail.reason ||
        `No available slots found for ${avail.date}. Our regular OPD hours are Mon-Sat 9am-1pm and 4pm-8pm. Would you like to check the next working day?`;
      quickReplies = ['Check Tomorrow', 'Clinic Hours', 'Call Clinic'];
    }

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: replyText,
      language: 'en',
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

  // Check if user is confirming a proposed booking
  const confirmMatch = lower.match(
    /\b(confirm|yes\b|please book|book this)\b.*?(?:(\d{1,2}:\d{2}\s*(?:am|pm)?)|(\d{1,2}\s*(?:am|pm)))?/i
  );
  const hasPendingBookingContext = history.some(
    (h) => h.sender === 'bot' && h.intent === 'booking_create' && h.text.includes('slots available')
  );

  if (confirmMatch && hasPendingBookingContext) {
    const lastBotMsg = [...history].reverse().find((h) => h.sender === 'bot' && h.text.includes('slots available'));
    const dateMatch = lastBotMsg?.text.match(/(\d{4}-\d{2}-\d{2})/);
    const bookingDate = dateMatch ? dateMatch[1] : targetDate || now.dateStr;

    const slotTimeMatch =
      userText.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i) || lastBotMsg?.text.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    const chosenTime = slotTimeMatch ? slotTimeMatch[1] : '10:00 AM';

    const booking = await confirmBooking({
      businessId,
      customerId,
      service: 'General Physician Consultation (Dr. Sneha Rao)',
      startTimeIso: `${bookingDate}T10:00:00.000Z`,
      endTimeIso: `${bookingDate}T10:30:00.000Z`,
      notes: `Booked via Web Chat for ${senderName || 'Patient'}`,
    });

    const confirmedReply = `Your appointment has been confirmed!\n\nBooking ID: ${booking.id.toUpperCase()}\nService: General Physician Consultation (Dr. Sneha Rao)\nDate: ${bookingDate}\nTime: ${chosenTime}\nLocation: City Health Clinic, 42 1st Main, Indiranagar.\n\nPlease arrive 10 minutes prior to your slot. Cancellation or rescheduling is free up to 2 hours in advance.`;

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: confirmedReply,
      language: 'en',
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

  // 7. LLM Orchestrator Loop (for FAQs, general inquiries, intent grounding, and unknown topics)
  const systemPrompt = `You are the AI Front-Desk Assistant for "City Health Clinic" in Indiranagar, Bengaluru.
Current Local Date & Time: ${now.dateStr} ${now.timeStr} (Timezone: Asia/Kolkata).

STRICT RULES:
1. ONLY answer questions using the clinic knowledge base below. NEVER invent prices, hours, doctor names, or facts.
2. MEDICAL SAFETY: NEVER provide medical advice, diagnosis, medicine recommendations, or dosages. If asked about medication or medical treatment, set decision="escalate" immediately.
3. If an inquiry cannot be answered from the knowledge base, set decision="escalate" and confidence=0.4.
4. Keep replies polite, concise, reassuring, and mobile-friendly. Support customer's language (English, Hindi, Kannada, Hinglish).
5. Output valid JSON matching this exact structure:
{
  "intent": "faq" | "booking_create" | "booking_change_or_cancel" | "availability_check" | "greeting_or_smalltalk" | "complaint" | "sensitive_or_out_of_scope" | "unknown",
  "decision": "answer" | "act" | "escalate",
  "reply_text": "Customer reply in their language",
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

  // If LLM returned fallback (e.g. API keys not configured or network down)
  // Check if we have a direct high-confidence FAQ match in the knowledge base
  if (llmResult.provider === 'fallback' && kbData.faqs.length > 0) {
    const topFaq = kbData.faqs[0];
    const queryTerms = userText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const textToMatch = `${topFaq.question} ${(topFaq.keywords || []).join(' ')}`.toLowerCase();
    const matchCount = queryTerms.filter((term) => textToMatch.includes(term)).length;

    if (matchCount >= 2) {
      llmResult = {
        intent: 'faq',
        decision: 'answer',
        reply_text: topFaq.answer,
        language: 'en',
        confidence: 0.95,
        kb_refs: [topFaq.id],
        tool_calls: [],
        provider: 'kb_direct',
      };
    }
  }

  // Force escalation if confidence is low, or if decision is escalate, or if intent is complaint / sensitive
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
    language: llmResult.language,
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
