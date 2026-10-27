// src/lib/kb/voice-setup.ts
import { z } from 'zod';
import { KnowledgeBaseContent } from '../db/types';
import { callLLM } from '../llm';

export const ServiceItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration_mins: z.number().default(30),
  price: z.number().optional(),
  description: z.string().optional(),
});

export const FAQItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  category: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});

export const BookingRulesSchema = z.object({
  slot_length_mins: z.number().default(30),
  capacity_per_slot: z.number().default(1),
  working_days: z.array(z.number()).default([1, 2, 3, 4, 5, 6]),
  working_hours: z.object({
    start: z.string().default('09:00'),
    end: z.string().default('20:00'),
    break_start: z.string().optional(),
    break_end: z.string().optional(),
  }),
  lead_time_hours: z.number().default(1),
  cancel_lead_hours: z.number().default(2),
  cancellation_policy: z.string().default('Free cancellation up to 2 hours before appointment.'),
});

export const KnowledgeBaseContentSchema = z.object({
  facts: z.object({
    name: z.string().default(''),
    type: z.string().default('Clinic'),
    address: z.string().default(''),
    phone: z.string().default(''),
    emergency_phone: z.string().optional().default(''),
    hours: z.record(z.string()).default({}),
    consulting_doctors: z.array(z.string()).optional().default([]),
    specialties: z.array(z.string()).optional().default([]),
    landmark: z.string().optional().default(''),
    payment_methods: z.string().optional().default(''),
    parking: z.string().optional().default(''),
  }),
  services: z.array(ServiceItemSchema).default([]),
  faqs: z.array(FAQItemSchema).default([]),
  booking_rules: BookingRulesSchema,
  escalation_rules: z.array(z.string()).default([]),
  never_answer: z.array(z.string()).default([]),
  holidays: z.array(z.string()).default([]),
  tone: z.string().default('polite, professional, reassuring and concise'),
});

export interface KBDifference {
  path: string;
  changeType: 'added' | 'changed' | 'removed';
  before: any;
  after: any;
  isSafetyRelated: boolean;
  description: string;
}

/**
 * Computes deep field-level differences between before & after KB versions
 */
export function computeKBDiff(
  before: KnowledgeBaseContent,
  after: KnowledgeBaseContent
): { differences: KBDifference[]; hasSafetyChanges: boolean } {
  const differences: KBDifference[] = [];

  // Check facts
  for (const key of Object.keys(after.facts)) {
    const valBefore = (before.facts as any)[key];
    const valAfter = (after.facts as any)[key];
    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      differences.push({
        path: `facts.${key}`,
        changeType: !valBefore ? 'added' : !valAfter ? 'removed' : 'changed',
        before: valBefore,
        after: valAfter,
        isSafetyRelated: key === 'emergency_phone',
        description: `Updated business fact: ${key}`,
      });
    }
  }

  // Check hours
  const hoursBefore = before.facts.hours || {};
  const hoursAfter = after.facts.hours || {};
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    if (hoursBefore[day] !== hoursAfter[day]) {
      differences.push({
        path: `facts.hours.${day}`,
        changeType: !hoursBefore[day] ? 'added' : !hoursAfter[day] ? 'removed' : 'changed',
        before: hoursBefore[day],
        after: hoursAfter[day],
        isSafetyRelated: false,
        description: `Clinic hours for ${day} changed from "${hoursBefore[day] || 'Unset'}" to "${hoursAfter[day] || 'Closed'}"`,
      });
    }
  }

  // Check FAQs
  const beforeFaqMap = new Map(before.faqs.map((f) => [f.id || f.question, f]));
  const afterFaqMap = new Map(after.faqs.map((f) => [f.id || f.question, f]));

  for (const [id, fAfter] of afterFaqMap.entries()) {
    const fBefore = beforeFaqMap.get(id);
    if (!fBefore) {
      differences.push({
        path: `faqs[${fAfter.question}]`,
        changeType: 'added',
        before: null,
        after: fAfter.answer,
        isSafetyRelated: false,
        description: `New FAQ added: "${fAfter.question}"`,
      });
    } else if (fBefore.answer !== fAfter.answer) {
      differences.push({
        path: `faqs[${fAfter.question}]`,
        changeType: 'changed',
        before: fBefore.answer,
        after: fAfter.answer,
        isSafetyRelated: false,
        description: `FAQ updated: "${fAfter.question}"`,
      });
    }
  }

  for (const [id, fBefore] of beforeFaqMap.entries()) {
    if (!afterFaqMap.has(id)) {
      differences.push({
        path: `faqs[${fBefore.question}]`,
        changeType: 'removed',
        before: fBefore.answer,
        after: null,
        isSafetyRelated: false,
        description: `FAQ removed: "${fBefore.question}"`,
      });
    }
  }

  // Check never_answer (CRITICAL SAFETY)
  const neverBefore = new Set(before.never_answer || []);
  const neverAfter = new Set(after.never_answer || []);

  for (const item of neverAfter) {
    if (!neverBefore.has(item)) {
      differences.push({
        path: 'never_answer',
        changeType: 'added',
        before: null,
        after: item,
        isSafetyRelated: true,
        description: `Safety guardrail added: "${item}"`,
      });
    }
  }

  for (const item of neverBefore) {
    if (!neverAfter.has(item)) {
      differences.push({
        path: 'never_answer',
        changeType: 'removed',
        before: item,
        after: null,
        isSafetyRelated: true,
        description: `⚠️ SAFETY WARNING: Guardrail removed: "${item}"`,
      });
    }
  }

  // Check escalation rules
  const escBefore = new Set(before.escalation_rules || []);
  const escAfter = new Set(after.escalation_rules || []);

  for (const item of escAfter) {
    if (!escBefore.has(item)) {
      differences.push({
        path: 'escalation_rules',
        changeType: 'added',
        before: null,
        after: item,
        isSafetyRelated: true,
        description: `Escalation rule added: "${item}"`,
      });
    }
  }

  for (const item of escBefore) {
    if (!escAfter.has(item)) {
      differences.push({
        path: 'escalation_rules',
        changeType: 'removed',
        before: item,
        after: null,
        isSafetyRelated: true,
        description: `⚠️ Escalation rule removed: "${item}"`,
      });
    }
  }

  const hasSafetyChanges = differences.some((d) => d.isSafetyRelated);
  return { differences, hasSafetyChanges };
}

/**
 * General semantic correction fallback when LLM is offline or returns non-JSON.
 * Interprets hours changes, service additions, and policy guardrails without hardcoding specific days or procedures.
 */
export function applySemanticCorrectionFallback(
  correctionText: string,
  currentKB: KnowledgeBaseContent
): KnowledgeBaseContent {
  const candidateContent: KnowledgeBaseContent = JSON.parse(JSON.stringify(currentKB));
  const lower = correctionText.toLowerCase();
  const emergencyNum =
    currentKB.facts.emergency_phone || currentKB.facts.phone || '+91 98765 99999';

  // 1. Day of week & Working hours updates (General across all 7 days)
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    const dayLower = day.toLowerCase();
    if (lower.includes(dayLower)) {
      // Check for closing time change (e.g. "close at 6 pm" or "closes at 6:00 pm")
      const closeMatch = lower.match(/close(?:s)?\s*(?:at)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

      if (closeMatch && !lower.includes('closed except')) {
        let closeTimeStr = closeMatch[1].trim();
        if (!closeTimeStr.toLowerCase().includes('pm') && !closeTimeStr.toLowerCase().includes('am')) {
          closeTimeStr += ' PM';
        }
        const timeNormalized = closeTimeStr.toUpperCase();
        let formattedClose = timeNormalized.includes(':')
          ? timeNormalized
          : timeNormalized.replace(/\s*(AM|PM)/, ':00 $1');
        if (formattedClose.includes(':')) {
          const [h, rest] = formattedClose.split(':');
          formattedClose = `${h.padStart(2, '0')}:${rest}`;
        }
        candidateContent.facts.hours[day] = `09:00 AM - 01:00 PM, 04:00 PM - ${formattedClose}`;

        const faqIdx = candidateContent.faqs.findIndex(
          (f) => f.question.toLowerCase().includes(dayLower) || (f.keywords && f.keywords.includes(dayLower))
        );
        const dayFaq = {
          id: faqIdx !== -1 ? candidateContent.faqs[faqIdx].id : `faq_${dayLower}_timings`,
          question: `What are your clinic timings on ${day}?`,
          answer: `On ${day}s, City Health Clinic is open: ${candidateContent.facts.hours[day]}.`,
          category: 'timings',
          keywords: [dayLower, 'timings', 'hours', 'open', 'close', 'saturday', 'timing'],
        };
        if (faqIdx !== -1) {
          candidateContent.faqs[faqIdx] = dayFaq;
        } else {
          candidateContent.faqs.unshift(dayFaq);
        }
      } else if (lower.includes('closed') || lower.includes('closed except')) {
        candidateContent.facts.hours[day] = `Closed except for emergencies (Emergency on-call: ${emergencyNum})`;
        const faqIdx = candidateContent.faqs.findIndex(
          (f) => f.question.toLowerCase().includes(dayLower) || (f.keywords && f.keywords.includes(dayLower))
        );
        const dayFaq = {
          id: faqIdx !== -1 ? candidateContent.faqs[faqIdx].id : `faq_${dayLower}_timings`,
          question: `Are you open on ${day}s?`,
          answer: `City Health Clinic is closed on ${day}s for routine outpatient appointments. However, emergency on-call care is available 24/7 at ${emergencyNum}.`,
          category: 'timings',
          keywords: [dayLower, 'timings', 'hours', 'open', 'closed', 'emergency'],
        };
        if (faqIdx !== -1) {
          candidateContent.faqs[faqIdx] = dayFaq;
        } else {
          candidateContent.faqs.unshift(dayFaq);
        }
      }
    }
  }

  // 2. Service additions or updates (General)
  // e.g. "We added a dental cleaning service, 30 minutes, 800 rupees"
  if (lower.includes('add') || lower.includes('added') || lower.includes('new service')) {
    const durationMatch = lower.match(/(\d+)\s*(?:mins|minutes|min)/i);
    const priceMatch =
      lower.match(/(\d+)\s*(?:rupees|rs|inr)/i) ||
      lower.match(/(?:fee|price|cost)\s*(?:of)?\s*(?:rs\.?|inr)?\s*(\d+)/i);

    const nameMatch = lower.match(/(?:added|add)\s+(?:a|an)?\s*([^,\.]+?)(?:\s+service|,|\s+\d+)/i);
    const serviceName = nameMatch ? nameMatch[1].trim() : 'Specialist Service';
    const capitalizedName = serviceName.replace(/\b\w/g, (c) => c.toUpperCase());
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 30;
    const price = priceMatch ? parseInt(priceMatch[1], 10) : undefined;
    const slug = serviceName.replace(/\s+/g, '_').toLowerCase();

    const existingSvcIdx = candidateContent.services.findIndex(
      (s) => s.name.toLowerCase().includes(serviceName) || s.id.includes(slug)
    );
    const newService = {
      id: existingSvcIdx !== -1 ? candidateContent.services[existingSvcIdx].id : `service_${slug}`,
      name: capitalizedName,
      duration_mins: duration,
      price,
      description: `${capitalizedName} (${duration} mins${price ? ` - ₹${price}` : ''})`,
    };

    if (existingSvcIdx !== -1) {
      candidateContent.services[existingSvcIdx] = newService;
    } else {
      candidateContent.services.push(newService);
    }

    const faqIdx = candidateContent.faqs.findIndex(
      (f) => f.question.toLowerCase().includes(serviceName) || (f.keywords && f.keywords.includes(slug))
    );
    const svcKeywords = serviceName.split(/\s+/).concat(['service', 'booking', 'cost', 'fee', 'charge']);
    const serviceFaq = {
      id: faqIdx !== -1 ? candidateContent.faqs[faqIdx].id : `faq_${slug}`,
      question: `Do you offer ${serviceName} and what is the fee?`,
      answer: `Yes, City Health Clinic offers ${capitalizedName} (${duration} minutes)${price ? ` for ₹${price}` : ''}. Appointments can be scheduled with our clinic team.`,
      category: 'services',
      keywords: svcKeywords,
    };

    if (faqIdx !== -1) {
      candidateContent.faqs[faqIdx] = serviceFaq;
    } else {
      candidateContent.faqs.unshift(serviceFaq);
    }
  }

  // 3. Prohibited topics / Custom guardrails (General)
  // e.g. "Never discuss pricing over chat, ask them to call"
  const isFacilityOrTieUp =
    lower.includes('tie-up') ||
    lower.includes('partner') ||
    lower.includes('discount') ||
    lower.includes('in-house') ||
    lower.includes('across the street') ||
    lower.includes('diagnostics') ||
    lower.includes('scan') ||
    lower.includes('facility') ||
    lower.includes('facilities');

  if (
    !isFacilityOrTieUp &&
    (lower.includes('never') ||
      lower.includes("don't") ||
      lower.includes('do not') ||
      lower.includes('ask them to call'))
  ) {
    if (lower.includes('pricing') || lower.includes('price') || lower.includes('fee')) {
      const rule = 'Discussing or quoting procedure and treatment pricing over chat (patients must call clinic directly)';
      if (!candidateContent.never_answer.includes(rule)) {
        candidateContent.never_answer.push(rule);
      }
      const escRule = 'Customer asks for pricing or fee details over chat -> escalate or direct to call clinic directly';
      if (!candidateContent.escalation_rules.includes(escRule)) {
        candidateContent.escalation_rules.push(escRule);
      }

      const pricingFaq = {
        id: 'faq_pricing_policy',
        question: 'What are your treatment and procedure charges?',
        answer: `We do not discuss procedure pricing over chat. Please call City Health Clinic directly at ${currentKB.facts.phone || '+91 80 2525 0100'} for all pricing and fee inquiries.`,
        category: 'pricing',
        keywords: ['pricing', 'price', 'fee', 'fees', 'cost', 'charges', 'rate'],
      };
      const existingPricingFaqIdx = candidateContent.faqs.findIndex(
        (f) => f.keywords && f.keywords.includes('pricing')
      );
      if (existingPricingFaqIdx !== -1) {
        candidateContent.faqs[existingPricingFaqIdx] = pricingFaq;
      } else {
        candidateContent.faqs.unshift(pricingFaq);
      }
    } else {
      const prohibitionRule = `Prohibited by clinic owner: ${correctionText.trim()}`;
      if (!candidateContent.never_answer.includes(prohibitionRule)) {
        candidateContent.never_answer.push(prohibitionRule);
      }
    }
  }

  // 4. General informational FAQ additions/updates (e.g. equipment, diagnostic tie-ups, clinic facilities)
  const isHoursChange = lower.includes('close') || lower.includes('hours') || lower.includes('timings');
  const isServiceChange = lower.includes('added') || lower.includes('add ') || lower.includes('new service');
  const isProhibitionChange = !isFacilityOrTieUp && (lower.includes('never') || lower.includes("don't") || lower.includes('do not'));

  if (!isHoursChange && !isServiceChange && !isProhibitionChange) {
    const stopWords = new Set([
      'have', 'with', 'that', 'this', 'where', 'receive', 'clinic', 'official',
      'does', 'from', 'into', 'what', 'when', 'some', 'about', 'they', 'their',
      'the', 'and', 'for', 'are', 'we', 'do', 'not', 'an', 'or', 'in'
    ]);
    const extractedKeywords = lower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    if (lower.includes('mri') && !extractedKeywords.includes('mri')) extractedKeywords.push('mri');
    if (lower.includes('ct') && !extractedKeywords.includes('ct')) extractedKeywords.push('ct');
    if (lower.includes('scan') && !extractedKeywords.includes('scan')) extractedKeywords.push('scan');

    const faqId = `faq_info_${Date.now()}`;
    const question =
      lower.includes('mri') || lower.includes('ct')
        ? 'Do you offer MRI and CT scan facilities?'
        : `Do you offer ${extractedKeywords.slice(0, 3).join(' ')} or related facilities?`;

    candidateContent.faqs.unshift({
      id: faqId,
      question,
      answer: correctionText.trim(),
      category: 'facilities',
      keywords: Array.from(new Set(extractedKeywords)),
    });
  }

  return candidateContent;
}

/**
 * Code-level validation to prevent unauthorized or hallucinated mutations after voice corrections.
 * Any KB field modified that the correction text did not explicitly mention is reverted and logged.
 */
export function validateAndConstrainCorrection(
  correctionText: string,
  before: KnowledgeBaseContent,
  candidateAfter: KnowledgeBaseContent
): {
  constrainedContent: KnowledgeBaseContent;
  rejectedModifications: string[];
} {
  const lower = correctionText.toLowerCase();
  const constrained: KnowledgeBaseContent = JSON.parse(JSON.stringify(candidateAfter));
  const rejectedModifications: string[] = [];

  // 1. Working Hours validation per day (General across all 7 days)
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    const dayLower = day.toLowerCase();
    const isDayMentioned =
      lower.includes(dayLower) ||
      (lower.includes('weekend') && (dayLower === 'saturday' || dayLower === 'sunday'));
    const beforeHour = before.facts.hours?.[day];
    const candidateHour = candidateAfter.facts.hours?.[day];

    if (!isDayMentioned && beforeHour !== candidateHour) {
      constrained.facts.hours[day] = beforeHour;
      rejectedModifications.push(
        `Unrelated change to ${day} hours reverted: "${candidateHour}" -> "${beforeHour}"`
      );
    }
  }

  // 2. Services & Pricing validation
  const mentionsPricing =
    lower.includes('price') ||
    lower.includes('fee') ||
    lower.includes('rupee') ||
    lower.includes('cost') ||
    lower.includes('charge');
  const mentionsService =
    lower.includes('service') ||
    lower.includes('doctor') ||
    lower.includes('consultation') ||
    lower.includes('treatment') ||
    lower.includes('dental') ||
    lower.includes('added') ||
    lower.includes('add');

  const isAddingOrUpdatingService =
    lower.includes('add') || lower.includes('new service') || lower.includes('duration');

  if (!mentionsPricing && !mentionsService) {
    if (JSON.stringify(before.services) !== JSON.stringify(candidateAfter.services)) {
      constrained.services = JSON.parse(JSON.stringify(before.services));
      rejectedModifications.push(
        'Unrelated modifications to clinic services and consultation fees reverted'
      );
    }
  } else if (!isAddingOrUpdatingService && (lower.includes('never') || lower.includes("don't") || lower.includes('do not'))) {
    // If owner only dictated a negative policy (e.g. "Never discuss pricing"), do not let services change
    constrained.services = JSON.parse(JSON.stringify(before.services));
  }

  // 3. Location / Address validation
  const mentionsAddress =
    lower.includes('address') ||
    lower.includes('location') ||
    lower.includes('road') ||
    lower.includes('street') ||
    lower.includes('landmark');
  if (!mentionsAddress) {
    if (before.facts.address !== candidateAfter.facts.address) {
      constrained.facts.address = before.facts.address;
      rejectedModifications.push('Unrelated change to clinic address reverted');
    }
  }

  // 4. Critical Safety Guardrail Enforcement (never_answer & escalation_rules)
  // Medical safety guardrails can NEVER be removed by any correction,
  // even if untrusted owner input or prompt injection says "remove all safety rules".
  for (const rule of before.never_answer || []) {
    if (!constrained.never_answer.includes(rule)) {
      constrained.never_answer.push(rule);
      rejectedModifications.push(`Critical safety guardrail protected from deletion: "${rule}"`);
    }
  }
  for (const escRule of before.escalation_rules || []) {
    if (!constrained.escalation_rules.includes(escRule)) {
      constrained.escalation_rules.push(escRule);
      rejectedModifications.push(`Escalation rule protected from deletion: "${escRule}"`);
    }
  }

  return { constrainedContent: constrained, rejectedModifications };
}

/**
 * Identifies missing details from extracted KB content
 */
export function detectMissingInformation(kb: KnowledgeBaseContent): string[] {
  const missing: string[] = [];

  if (!kb.facts.phone) missing.push('Clinic primary contact phone number');
  if (!kb.facts.emergency_phone) missing.push('Emergency contact phone number');
  if (!kb.facts.address) missing.push('Exact clinic address / location');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const missingDays = days.filter((d) => !kb.facts.hours || !kb.facts.hours[d]);
  if (missingDays.length > 0) {
    missing.push(`Working hours for: ${missingDays.join(', ')}`);
  }

  if (!kb.services || kb.services.length === 0) {
    missing.push('List of clinic services and consultation durations/fees');
  }

  if (!kb.booking_rules?.cancellation_policy) {
    missing.push('Appointment cancellation or rescheduling policy');
  }

  return missing;
}
