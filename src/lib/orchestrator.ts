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
  parseRequestedTime,
} from './booking';
import { OutgoingMessage } from './channels';
import { detectLanguage, Dialect } from './locale/detector';
import { getLocalizedTemplate, formatHumanDate } from './locale/templates';

export interface ProcessMessageParams {
  businessId: string;
  channel?: string;
  conversationId?: string;
  customerId?: string;
  senderName?: string;
  senderContact?: string;
  text: string;
}

function isComplaintOrEscalation(text: string): { isEscalation: boolean; reason?: string; reply?: string } {
  const lower = text.toLowerCase();

  // 1. Direct Human / Manager Escalation Demand
  if (
    /\b(speak|talk|connect|transfer|call)\b.*?\b(manager|owner|human|staff|person|agent|head doctor|director)\b/i.test(lower) ||
    /\b(talk to human|speak to human|real person|human agent|call me back)\b/i.test(lower) ||
    /\b(baat karwao|manager se baat|doctor se baat karni)\b/i.test(lower)
  ) {
    return {
      isEscalation: true,
      reason: 'Customer requested direct human or clinic manager escalation',
      reply: 'I have flagged your request for our clinic manager and head staff. A team member will contact you shortly. For immediate urgent assistance, you may also reach our front desk directly at +91 98765 43210.',
    };
  }

  // 2. Complaints regarding staff conduct, delays, wait times, cleanliness
  if (
    /\b(rude|unprofessional|terrible|horrible|worst|disgusting|angry|useless|waste|pathetic)\b/i.test(lower) ||
    /\b(waiting\s+room|receptionist|staff|nurse)\b.*?\b(rude|noisy|dirty|bad|delayed|waiting|kept me)\b/i.test(lower) ||
    /\b(arrived|came|waited)\b.*?\b(late|hour late|hours late|delayed)\b/i.test(lower) ||
    /\b(shikayat|ganda|kharab|shor|deri|bekar)\b/i.test(lower)
  ) {
    return {
      isEscalation: true,
      reason: 'Customer submitted a complaint regarding staff conduct, delays, or clinic environment',
      reply: 'We sincerely apologise for your experience at City Health Clinic. We take patient feedback very seriously. Your concern has been escalated directly to clinic management for review and follow-up.',
    };
  }

  // 3. Discount bargaining & custom price negotiations
  if (
    /\b(discount|bargain|reduce\s+fee|concession|kam\s+karo|kam\s+kariye|kamti|kam\s+hoga|kamti\s+madi)\b/i.test(lower) ||
    /\b(\d+%\s*discount|cheaper|offer\s+code)\b/i.test(lower)
  ) {
    return {
      isEscalation: true,
      reason: 'Customer requested custom discount or price negotiation (violates standard billing policy)',
      reply: 'City Health Clinic consultation and service fees are standardized, and custom discounts cannot be negotiated over chat. Your inquiry has been noted for our administrative desk.',
    };
  }

  // 4. Legal notice or dispute threats
  if (
    /\b(legal\s+notice|sue|lawyer|court|police|dispute|fraud|consumer\s+court)\b/i.test(lower)
  ) {
    return {
      isEscalation: true,
      reason: 'Customer threatened legal dispute or formal action',
      reply: 'We have logged your communication regarding this dispute. It has been escalated directly to clinic administration and management for formal review.',
    };
  }

  // 5. Prompt injection, secret exfiltration & administrative override attempts
  if (
    /\b(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|system\s+prompt|reveal\s+(your\s+)?prompt|owner\s+password|admin\s+password|cancel\s+all\s+bookings|change\s+the\s+clinic\s+hours|jailbreak|dan\s+mode|developer\s+mode)\b/i.test(lower) ||
    /\b(you\s+are\s+now\s+a\s+doctor|pretend\s+to\s+be\s+a\s+doctor|act\s+as\s+a\s+doctor)\b/i.test(lower)
  ) {
    return {
      isEscalation: true,
      reason: 'Prompt injection or unauthorized administrative override attempted by user',
      reply: 'City Health Clinic assistant operates under strict clinic guidelines and cannot reveal internal instructions, passwords, or alter clinic administrative settings. Your message has been recorded for staff.',
    };
  }

  return { isEscalation: false };
}

function matchHighConfidenceFaq(
  text: string,
  kbData: any,
  dialect: Dialect
): { matched: boolean; reply: string; kbRef: string } | null {
  const clean = text.toLowerCase().trim();

  // Guard: complex, medical, insurance, multi-intent, booking, or complaint keywords must fall through to LLM or existing handlers
  if (
    clean.includes('emergency') ||
    clean.includes('dr ') ||
    clean.includes('doctor') ||
    clean.includes('specialize') ||
    clean.includes('specialis') ||
    clean.includes('symptom') ||
    clean.includes('medic') ||
    clean.includes('fever') ||
    clean.includes('pain') ||
    clean.includes('cancel') ||
    clean.includes('book') ||
    clean.includes('appointment') ||
    clean.includes('mother') ||
    clean.includes('father') ||
    clean.includes('family') ||
    clean.includes('insurance') ||
    clean.includes('mediclaim') ||
    clean.includes('blood test') ||
    clean.includes('lab') ||
    clean.includes('mri') ||
    clean.includes('ct scan') ||
    clean.includes('x-ray') ||
    clean.includes('ultrasound') ||
    clean.includes('nearby') ||
    clean.includes('cost of') ||
    clean.includes('discount') ||
    clean.includes('negotiat')
  ) {
    return null;
  }

  // 1. Timings & Working Hours
  const isTimings =
    /\b(clinic timings|opd hours|opening hours|clinic hours|working hours|samay kya|khulne ka samay|kab khula|kab band|kab khulta)\b/i.test(clean) ||
    (/\b(timings|hours|timing)\b/i.test(clean) && /\b(clinic|opd|open|close|routine)\b/i.test(clean)) ||
    (clean.includes('ಸಮಯ') && clean.includes('ತೆರೆದಿರುತ್ತದೆ'));

  if (isTimings) {
    let reply = '';
    if (dialect === 'hi') {
      reply = `सिटी हेल्थ क्लिनिक सोमवार से शनिवार सुबह 09:00 AM से 01:00 PM (मॉर्निंग ओपीडी) और शाम 04:00 PM से 08:00 PM (इवनिंग ओपीडी) खुला रहता है। रविवार को नियमित ओपीडी बंद रहती है।`;
    } else if (dialect === 'hi_latin') {
      reply = `City Health Clinic Monday se Saturday subah 09:00 AM se 01:00 PM (Morning OPD) aur shaam 04:00 PM se 08:00 PM (Evening OPD) tak khula rehta hai. Sunday ko routine appointments ke liye clinic band rehta hai.`;
    } else if (dialect === 'kn') {
      reply = `ಸಿಟಿ ಹೆಲ್ತ್ ಕ್ಲಿನಿಕ್ ಸೋಮವಾರದಿಂದ ಶನಿವಾರದವರೆಗೆ ಬೆಳಿಗ್ಗೆ 09:00 AM ರಿಂದ 01:00 PM (ಬೆಳಿಗ್ಗೆ OPD) ಮತ್ತು ಸಂಜೆ 04:00 PM ರಿಂದ 08:00 PM (ಸಂಜೆ OPD) ತೆರೆದಿರುತ್ತದೆ. ಭಾನುವಾರ ಸಾಮಾನ್ಯ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗಳಿಗೆ ರಜೆ ಇರುತ್ತದೆ.`;
    } else if (dialect === 'kn_latin') {
      reply = `City Health Clinic Monday inda Saturday beligge 09:00 AM inda 01:00 PM mathu sanje 04:00 PM inda 08:00 PM therediruttade. Sunday routine OPD closed iruththe.`;
    } else {
      reply =
        kbData.faqs.find((f: any) => f.id === 'faq_hours')?.answer ||
        'The clinic is open Monday to Saturday from 09:00 AM to 01:00 PM (Morning OPD) and 04:00 PM to 08:00 PM (Evening OPD). Sunday is closed for routine appointments.';
    }
    return { matched: true, reply, kbRef: 'faq_hours' };
  }

  // 2. Location & Landmark
  const isLocation =
    /\b(where is|location|landmark|reach the clinic|clinic address|exact location|clinic kahan|kahan hai|elli ide|vilasa)\b/i.test(clean) &&
    !clean.includes('parking') && !clean.includes('fee');

  if (isLocation) {
    let reply = '';
    if (dialect === 'hi') {
      reply = `सिटी हेल्थ क्लिनिक 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038 पर स्थित है, BDA Complex के सामने और Indiranagar Metro Station से 200 मीटर की दूरी पर।`;
    } else if (dialect === 'hi_latin') {
      reply = `City Health Clinic 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038 par sthit hai, BDA Complex ke samne aur Indiranagar Metro Station se 200m door.`;
    } else if (dialect === 'kn') {
      reply = `ಸಿಟಿ ಹೆಲ್ತ್ ಕ್ಲಿನಿಕ್ 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038 ನಲ್ಲಿದೆ (BDA Complex ಎದುರು ಮತ್ತು Indiranagar Metro Station ನಿಂದ 200 ಮೀಟರ್).`;
    } else if (dialect === 'kn_latin') {
      reply = `City Health Clinic 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038 nalli ide (BDA Complex mundhe, Indiranagar Metro Station inda 200m).`;
    } else {
      reply =
        kbData.faqs.find((f: any) => f.id === 'faq_location')?.answer ||
        'We are at 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038, opposite the BDA Complex and 200m from Indiranagar Metro Station.';
    }
    return { matched: true, reply, kbRef: 'faq_location' };
  }

  // 3. Four-Wheeler & Two-Wheeler Parking
  const isParking =
    /\b(car parking|four-wheeler parking|four wheeler parking|vehicle parking|parking available|parking facility|parking ki suvidha|parking ideya)\b/i.test(clean) ||
    (clean.includes('parking') && (clean.includes('four-wheeler') || clean.includes('car') || clean.includes('available')));

  if (isParking) {
    let reply = '';
    if (dialect === 'hi') {
      reply = `क्लिनिक के सामने दोपहिया वाहनों (two-wheelers) के लिए समर्पित पार्किंग उपलब्ध है। चार पहिया वाहनों (cars/four-wheelers) के लिए 7th Cross पर सड़क किनारे पार्किंग उपलब्ध है।`;
    } else if (dialect === 'hi_latin') {
      reply = `Clinic ke theek samne two-wheelers ke liye dedicated parking available hai. Four-wheelers aur cars ke liye 7th Cross par street parking available hai.`;
    } else if (dialect === 'kn') {
      reply = `ಕ್ಲಿನಿಕ್ ಮುಂಭಾಗದಲ್ಲಿ ದ್ವಿಚಕ್ರ ವಾಹನಗಳಿಗೆ (two-wheelers) ಪಾರ್ಕಿಂಗ್ ಲಭ್ಯವಿದೆ. ಕಾರುಗಳಿಗೆ 7th Cross ರಸ್ತೆಯ ಬದಿಯಲ್ಲಿ ಪಾರ್ಕಿಂಗ್ ಲಭ್ಯವಿದೆ.`;
    } else if (dialect === 'kn_latin') {
      reply = `Clinic munde two-wheelers ge dedicated parking ide. Four-wheelers mathu cars ge 7th Cross nalli street parking ide.`;
    } else {
      reply =
        kbData.faqs.find((f: any) => f.id === 'faq_parking')?.answer ||
        'Dedicated two-wheeler parking is available directly in front of the clinic. For four-wheelers and cars, street parking is available along 7th Cross.';
    }
    return { matched: true, reply, kbRef: 'faq_parking' };
  }

  // 4. Consultation Fees (Standard inquiry)
  const isFees =
    /\b(consultation fee|consultation charges|fee structure|fees kitni|kitna charge|shulka eshtu)\b/i.test(clean);

  if (isFees) {
    let reply = '';
    if (dialect === 'hi') {
      reply = `जनरल फिजिशियन परामर्श ₹500 है, बाल रोग विशेषज्ञ (Paediatric) परामर्श ₹600 है, बेसिक स्वास्थ्य जांच ₹350 और टीकाकरण ₹250 है।`;
    } else if (dialect === 'hi_latin') {
      reply = `General Physician consultation ₹500 hai, Paediatric consultation ₹600, Basic Health checkup ₹350, aur Vaccination administration ₹250 hai.`;
    } else if (dialect === 'kn') {
      reply = `ಜನರಲ್ ಫಿಜಿಶಿಯನ್ ಸಮಾಲೋಚನೆ ಶುಲ್ಕ ₹500, ಮಕ್ಕಳ ತಜ್ಞರ (Paediatric) ಸಮಾಲೋಚನೆ ಶುಲ್ಕ ₹600, ಆರೋಗ್ಯ ತಪಾಸಣೆ ₹350 ಮತ್ತು ಲಸಿಕೆ ₹250.`;
    } else if (dialect === 'kn_latin') {
      reply = `General Physician consultation ₹500, Paediatric consultation ₹600, Basic Health checkup ₹350, mathu Vaccination administration ₹250 ide.`;
    } else {
      reply =
        kbData.faqs.find((f: any) => f.id === 'faq_fees')?.answer ||
        'General Physician consultation is ₹500, Paediatric consultation is ₹600, Health checkup screening is ₹350, and Vaccination administration is ₹250.';
    }
    return { matched: true, reply, kbRef: 'faq_fees' };
  }

  // 5. Payment Methods (UPI, Cards, Cash)
  const isPayment =
    /\b(payment methods|payment options|modes of payment|accept upi|accept gpay|accept cards|credit card|pay cash|payment kaise)\b/i.test(clean);

  if (isPayment) {
    let reply = '';
    if (dialect === 'hi') {
      reply = `हम सभी परामर्शों और क्लिनिक सेवाओं के लिए नकद (Cash), UPI (Google Pay, PhonePe, Paytm) और सभी प्रमुख डेबिट/क्रेडिट कार्ड स्वीकार करते हैं।`;
    } else if (dialect === 'hi_latin') {
      reply = `Hum consultations aur clinic services ke liye Cash, UPI (Google Pay, PhonePe, Paytm), aur sabhi major Debit/Credit Cards accept karte hain.`;
    } else if (dialect === 'kn') {
      reply = `ನಾವು ನಗದು (Cash), UPI (Google Pay, PhonePe, Paytm) ಮತ್ತು ಎಲ್ಲಾ ಪ್ರಮುಖ ಡೆಬಿಟ್/ಕ್ರೆಡಿಟ್ ಕಾರ್ಡ್‌ಗಳನ್ನು ಸ್ವೀಕರಿಸುತ್ತೇವೆ.`;
    } else if (dialect === 'kn_latin') {
      reply = `Naavu Cash, UPI (Google Pay, PhonePe, Paytm), mathu ella major Debit/Credit Cards accept maduththeve.`;
    } else {
      reply = `We accept Cash, UPI (Google Pay, PhonePe, Paytm), and all major Debit/Credit Cards for consultations and services at the clinic.`;
    }
    return { matched: true, reply, kbRef: 'faq_payment' };
  }

  return null;
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

  // 6.5 Deterministic Escalation & Complaint Pre-Router
  const complaintCheck = isComplaintOrEscalation(userText);
  if (complaintCheck.isEscalation) {
    const escReply =
      complaintCheck.reply ||
      getLocalizedTemplate('safe_fallback', dialect);

    await db.createEscalation({
      conversation_id: convId,
      reason: complaintCheck.reason || 'Escalation triggered by customer inquiry',
      ai_summary: `Customer message: "${userText.slice(0, 100)}..."`,
      suggested_reply: escReply,
      status: 'open',
    });

    await db.updateConversationStatus(convId, 'needs_human');

    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: escReply,
      language: langDetection.language,
      intent: 'complaint',
      decision: 'escalate',
      confidence: 1.0,
      kb_refs: ['escalation_rules'],
      provider: 'deterministic_guardrail',
    });

    return {
      conversationId: convId,
      text: escReply,
      decision: 'escalate',
      intent: 'complaint',
      provider: 'deterministic_guardrail',
      quickReplies: ['Talk to Staff', 'Clinic Timings', 'Emergency Contact'],
    };
  }

  // 6.8 Customer Cancellation & Reschedule Router (Item 4)
  const isCancelQuery = /\b(cancel|cancellation|reschedule|radd|cancel\s+karna|cancel\s+madu)\b/i.test(userText);
  if (isCancelQuery && !userText.toLowerCase().includes('cancel all bookings')) {
    // Check if user provided Booking ID (e.g. "bk_12345", "bk-12345", or UUID)
    const idMatch = userText.match(/\b(bk[_-][a-zA-Z0-9_-]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
    // Check for phone number (10 digits, with optional spaces/hyphens and +91)
    const phoneMatch = userText.match(/(?:\+?91[\s-]?)?([6-9](?:[\s-]?\d){9})\b/);

    if (idMatch && phoneMatch) {
      const targetBkId = idMatch[1].trim();
      const providedPhone = phoneMatch[1].replace(/\D/g, '').trim();

      const genericMismatchReply = `Unable to verify booking details. Please ensure you provide the exact Booking ID and the 10-digit phone number used when booking (e.g. "Cancel BK_12345 9876543210"). For security, cancellations can only be processed when both credentials match our records. Alternatively, please call our front desk directly at ${kbData.facts.phone || '+91 80 2525 0100'}.`;

      const booking = await db.getBooking(targetBkId);
      if (!booking) {
        await db.createMessage({
          conversation_id: convId,
          sender: 'bot',
          text: genericMismatchReply,
          language: langDetection.language,
          intent: 'booking_change_or_cancel',
          decision: 'act',
          provider: 'deterministic_booking_engine',
        });
        return {
          conversationId: convId,
          text: genericMismatchReply,
          decision: 'act',
          intent: 'booking_change_or_cancel',
          provider: 'deterministic_booking_engine',
          quickReplies: ['Check Clinic Hours', 'Call Clinic'],
        };
      }

      // Verify ownership: customer contact must match provided phone
      const customer = await db.getCustomer(booking.customer_id);
      const customerContactClean = (customer?.contact || '').replace(/\D/g, '').slice(-10);
      const providedPhoneClean = providedPhone.replace(/\D/g, '').slice(-10);

      if (!customerContactClean || customerContactClean !== providedPhoneClean) {
        // Ownership verification failed - return same generic message to avoid disclosing ID existence
        await db.createMessage({
          conversation_id: convId,
          sender: 'bot',
          text: genericMismatchReply,
          language: langDetection.language,
          intent: 'booking_change_or_cancel',
          decision: 'act',
          provider: 'deterministic_booking_engine',
        });
        return {
          conversationId: convId,
          text: genericMismatchReply,
          decision: 'act',
          intent: 'booking_change_or_cancel',
          provider: 'deterministic_booking_engine',
          quickReplies: ['Call Clinic', 'Clinic Hours'],
        };
      }

      // Ownership verified! Cancel booking
      await db.cancelBooking(booking.id);
      const cancelSuccessReply = `Your appointment ${targetBkId.toUpperCase()} for ${booking.service} has been successfully cancelled and your slot has been released. If you need to rebook for a future date, simply let us know!`;
      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: cancelSuccessReply,
        language: langDetection.language,
        intent: 'booking_change_or_cancel',
        decision: 'act',
        provider: 'deterministic_booking_engine',
      });
      return {
        conversationId: convId,
        text: cancelSuccessReply,
        decision: 'act',
        intent: 'booking_change_or_cancel',
        provider: 'deterministic_booking_engine',
        quickReplies: ['Book New Appointment', 'Clinic Hours', 'Emergency Contact'],
      };
    } else {
      // User requested cancellation but did not provide Booking ID and Phone
      const cancelInstructionReply = `To cancel or reschedule an appointment securely per clinic policy, please reply with your Booking ID and the 10-digit phone number used to book (e.g. "Cancel BK_12345 9876543210"). Our front-desk team has also been notified to assist you if needed.`;
      
      await db.createEscalation({
        conversation_id: convId,
        reason: 'Customer requested appointment cancellation without full credentials',
        ai_summary: `Cancellation inquiry: "${userText.slice(0, 100)}"`,
        suggested_reply: 'Assist patient with appointment cancellation / rescheduling.',
        status: 'open',
      });

      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: cancelInstructionReply,
        language: langDetection.language,
        intent: 'booking_change_or_cancel',
        decision: 'act',
        confidence: 1.0,
        kb_refs: ['booking_rules'],
        provider: 'deterministic_booking_engine',
      });

      return {
        conversationId: convId,
        text: cancelInstructionReply,
        decision: 'act',
        intent: 'booking_change_or_cancel',
        provider: 'deterministic_booking_engine',
        quickReplies: ['Clinic Hours', 'Call Clinic', 'Talk to Staff'],
      };
    }
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
    const requestedTime = parseRequestedTime(userText);
    const matchedService =
      kbData.services.find((s) => {
        const sLower = s.name.toLowerCase();
        return (
          lower.includes(sLower) ||
          sLower
            .split(/\s+/)
            .some((w: string) => w.length > 4 && lower.includes(w) && w !== 'consultation' && w !== 'checkup')
        );
      }) ||
      kbData.services[0] || {
        id: 'service_general',
        name: 'General Physician Consultation',
        duration_mins: 30,
        price: 500,
      };

    const serviceName = matchedService.name;

    // Item 3: Handle requested times during OPD break (1:00 PM - 4:00 PM)
    if (requestedTime && requestedTime.isBreak) {
      const avail = await checkAvailability({
        businessId,
        service: serviceName,
        dateStr: targetDate,
        timeWindow: 'evening', // Nearest slots after break start at 4:00 PM
      });
      const nearestSlots = avail.slots.slice(0, 3).map((s) => s.time).join(', ');
      
      const formattedTargetDate = formatHumanDate(targetDate, dialect);
      let breakReply = '';
      if (langDetection.language === 'hi') {
        breakReply = `City Health Clinic ${requestedTime.display} baje band rehta hai (OPD break: 1:00 PM - 4:00 PM; OPD timings: 9:00 AM-1:00 PM aur 4:00 PM-8:00 PM). ${formattedTargetDate} ke liye nearest available evening slots yeh hain: ${nearestSlots}. Kya aap inme se koi slot book karna chahte hain?`;
      } else if (langDetection.language === 'kn') {
        breakReply = `City Health Clinic ${requestedTime.display} ಗಂಟೆಗೆ ಮುಚ್ಚಿರುತ್ತದೆ (OPD ವಿರಾಮ: 1:00 PM - 4:00 PM; OPD ಸಮಯ: 9:00 AM-1:00 PM ಮತ್ತು 4:00 PM-8:00 PM). ${formattedTargetDate} ಗೆ ಲಭ್ಯವಿರುವ ಹತ್ತಿರದ ಸಂಜೆ ಸ್ಲಾಟ್‌ಗಳು: ${nearestSlots}. ಇವುಗಳಲ್ಲಿ ಒಂದನ್ನು ದೃಢೀಕರಿಸಲು ಬಯಸುವಿರಾ?`;
      } else {
        breakReply = `City Health Clinic is closed at ${requestedTime.display} (our OPD break is 1:00 PM to 4:00 PM; regular OPD hours are Mon–Sat 9:00 AM–1:00 PM and 4:00 PM–8:00 PM). The nearest available slots on ${formattedTargetDate} are: ${nearestSlots}. Would you like to confirm one of these?`;
      }

      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: breakReply,
        language: langDetection.language,
        intent: 'booking_create',
        decision: 'act',
        confidence: 1.0,
        kb_refs: ['booking_rules'],
        provider: 'deterministic_booking_engine',
      });

      return {
        conversationId: convId,
        text: breakReply,
        decision: 'act',
        intent: 'booking_create',
        provider: 'deterministic_booking_engine',
        quickReplies: avail.slots.slice(0, 3).map((s) => `Confirm ${s.time} on ${targetDate} (${serviceName})`),
      };
    }

    // Item 3: Handle early morning requests (< 9:00 AM)
    if (requestedTime && requestedTime.isEarly) {
      const avail = await checkAvailability({
        businessId,
        service: serviceName,
        dateStr: targetDate,
        timeWindow: 'morning',
      });
      const nearestSlots = avail.slots.slice(0, 3).map((s) => s.time).join(', ');
      
      const formattedTargetDate = formatHumanDate(targetDate, dialect);
      let earlyReply = '';
      if (langDetection.language === 'hi') {
        earlyReply = `City Health Clinic ${requestedTime.display} baje band rehta hai (morning OPD 9:00 AM baje shuru hota hai). ${formattedTargetDate} ke liye nearest available slots yeh hain: ${nearestSlots}. Kya aap inme se koi book karna chahte hain?`;
      } else if (langDetection.language === 'kn') {
        earlyReply = `City Health Clinic ${requestedTime.display} ಗಂಟೆಗೆ ಮುಚ್ಚಿರುತ್ತದೆ (ಬೆಳಿಗ್ಗೆ OPD 9:00 AM ಕ್ಕೆ ಪ್ರಾರಂಭವಾಗುತ್ತದೆ). ${formattedTargetDate} ಗೆ ಲಭ್ಯವಿರುವ ಹತ್ತಿರದ ಸ್ಲಾಟ್‌ಗಳು: ${nearestSlots}. ಇವುಗಳಲ್ಲಿ ಒಂದನ್ನು ದೃಢೀಕರಿಸಲು ಬಯಸುವಿರಾ?`;
      } else {
        earlyReply = `City Health Clinic is closed at ${requestedTime.display} (morning OPD opens at 9:00 AM). The nearest available morning slots on ${formattedTargetDate} are: ${nearestSlots}. Would you like to confirm one of these?`;
      }

      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: earlyReply,
        language: langDetection.language,
        intent: 'booking_create',
        decision: 'act',
        confidence: 1.0,
        kb_refs: ['booking_rules'],
        provider: 'deterministic_booking_engine',
      });

      return {
        conversationId: convId,
        text: earlyReply,
        decision: 'act',
        intent: 'booking_create',
        provider: 'deterministic_booking_engine',
        quickReplies: avail.slots.slice(0, 3).map((s) => `Confirm ${s.time} on ${targetDate} (${serviceName})`),
      };
    }

    // Item 3: Handle after-closing / late night requests (>= 8:00 PM)
    if (requestedTime && requestedTime.isClosed) {
      const avail = await checkAvailability({
        businessId,
        service: serviceName,
        dateStr: targetDate,
        timeWindow: 'morning',
      });
      const nearestSlots = avail.slots.slice(0, 3).map((s) => s.time).join(', ');
      
      let closedReply = '';
      if (langDetection.language === 'hi') {
        closedReply = `City Health Clinic ${requestedTime.display} baje band rehta hai (evening OPD 8:00 PM baje band hota hai). Agle OPD session ke liye nearest available slots yeh hain: ${nearestSlots}. Kya aap inme se koi book karna chahte hain?`;
      } else if (langDetection.language === 'kn') {
        closedReply = `City Health Clinic ${requestedTime.display} ಗಂಟೆಗೆ ಮುಚ್ಚಿರುತ್ತದೆ (ಸಂಜೆ OPD 8:00 PM ಕ್ಕೆ ಮುಕ್ತಾಯವಾಗುತ್ತದೆ). ಲಭ್ಯವಿರುವ ಹತ್ತಿರದ ಸ್ಲಾಟ್‌ಗಳು: ${nearestSlots}. ಇವುಗಳಲ್ಲಿ ಒಂದನ್ನು ದೃಢೀಕರಿಸಲು ಬಯಸುವಿರಾ?`;
      } else {
        closedReply = `City Health Clinic is closed at ${requestedTime.display} (evening OPD closes at 8:00 PM). The nearest available slots on our next OPD session are: ${nearestSlots}. Would you like to confirm one of these?`;
      }

      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: closedReply,
        language: langDetection.language,
        intent: 'booking_create',
        decision: 'act',
        confidence: 1.0,
        kb_refs: ['booking_rules'],
        provider: 'deterministic_booking_engine',
      });

      return {
        conversationId: convId,
        text: closedReply,
        decision: 'act',
        intent: 'booking_create',
        provider: 'deterministic_booking_engine',
        quickReplies: avail.slots.slice(0, 3).map((s) => `Confirm ${s.time} on ${targetDate} (${serviceName})`),
      };
    }

    const avail = await checkAvailability({
      businessId,
      service: serviceName,
      dateStr: targetDate,
      timeWindow,
    });

    let replyText = '';
    let quickReplies: string[] = [];

    if (avail.available && avail.slots.length > 0) {
      const slotList = avail.slots.map((s) => s.time).join(', ');
      const windowDesc = `${timeWindow === 'any' ? 'OPD hours' : timeWindow} for ${serviceName}${matchedService.price ? ` (₹${matchedService.price})` : ''}`;
      replyText = getLocalizedTemplate('booking_slot_options', dialect, {
        date: avail.date,
        timeWindow: windowDesc,
        slots: slotList,
      });
      quickReplies = avail.slots.map((s) => `Confirm ${s.time} on ${avail.date} (${serviceName})`);
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

    // Exact full service name match takes priority over partial words
    const matchedService =
      kbData.services.find((s) => {
        const sLower = s.name.toLowerCase();
        return (
          lastBotMsg?.text.toLowerCase().includes(sLower) ||
          userText.toLowerCase().includes(sLower)
        );
      }) ||
      kbData.services.find((s) => {
        const sLower = s.name.toLowerCase();
        return sLower
          .split(/\s+/)
          .some((w: string) => w.length > 4 && lastBotMsg?.text.toLowerCase().includes(w) && w !== 'consultation' && w !== 'checkup');
      }) ||
      kbData.services[0] || {
        name: 'General Physician Consultation',
      };

    let startIso = `${bookingDate}T10:00:00.000Z`;
    let endIso = `${bookingDate}T10:30:00.000Z`;
    const timeMatch = chosenTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const p = timeMatch[3]?.toLowerCase();
      if (p === 'pm' && h < 12) h += 12;
      if (p === 'am' && h === 12) h = 0;
      startIso = `${bookingDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
      const dur = matchedService.duration_mins || 30;
      const totalM = h * 60 + m + dur;
      const endH = Math.floor(totalM / 60);
      const endM = totalM % 60;
      endIso = `${bookingDate}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00.000Z`;
    }

    let booking: any;
    try {
      booking = await confirmBooking({
        businessId,
        customerId,
        service: matchedService.name,
        startTimeIso: startIso,
        endTimeIso: endIso,
        notes: `Booked via Web Chat for ${senderName || 'Patient'}`,
      });
    } catch (bookingErr: any) {
      const avail = await checkAvailability({
        businessId,
        service: matchedService.name,
        dateStr: bookingDate,
        timeWindow: 'any',
      });
      const altTimesStr = avail.slots.map((s) => s.time).join(', ');
      const occupiedReply = `Sorry, that ${chosenTime} slot was just taken by another patient! Here are the next available slots for ${matchedService.name} on ${formatHumanDate(bookingDate, dialect)}: ${altTimesStr || 'No further slots available today'}. Would you like to select one of these?`;

      await db.createMessage({
        conversation_id: convId,
        sender: 'bot',
        text: occupiedReply,
        language: langDetection.language,
        intent: 'booking_create',
        decision: 'act',
        confidence: 0.95,
        kb_refs: ['booking_rules'],
        provider: 'deterministic_booking_engine',
      });

      return {
        conversationId: convId,
        text: occupiedReply,
        decision: 'act',
        intent: 'booking_create',
        provider: 'deterministic_booking_engine',
        quickReplies: avail.slots.map((s) => `Confirm ${s.time} on ${bookingDate} (${matchedService.name})`),
      };
    }

    const confirmedReply = getLocalizedTemplate('booking_confirmed', dialect, {
      id: booking.id.toUpperCase(),
      service: matchedService.name,
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

  // 7.8 High-Confidence Direct Knowledge Base FAQ Router (Item 3)
  // Reduces cloud LLM load on standard questions (timings, location, parking, fees, payment)
  const highConfFaq = matchHighConfidenceFaq(userText, kbData, dialect);
  if (highConfFaq) {
    await db.createMessage({
      conversation_id: convId,
      sender: 'bot',
      text: highConfFaq.reply,
      language: langDetection.language,
      intent: 'faq',
      decision: 'answer',
      confidence: 0.98,
      kb_refs: [highConfFaq.kbRef],
      provider: 'kb_direct',
    });

    return {
      conversationId: convId,
      text: highConfFaq.reply,
      decision: 'answer',
      intent: 'faq',
      provider: 'kb_direct',
      quickReplies: ['Book Appointment', 'Clinic Hours', 'Location'],
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
    failedOver: llmResult.failedOver,
    quickReplies: shouldEscalate
      ? ['Talk to Staff', 'Emergency Contact', 'Clinic Timings']
      : ['Book Appointment', 'Clinic Hours', 'Location & Parking'],
  };
}
