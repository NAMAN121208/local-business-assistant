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

  // 1. Working Hours validation per day
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    const dayLower = day.toLowerCase();
    const isDayMentioned =
      lower.includes(dayLower) ||
      (dayLower === 'sunday' && (lower.includes('weekend') || lower.includes('closed')));
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
    lower.includes('treatment');

  if (!mentionsPricing && !mentionsService) {
    if (JSON.stringify(before.services) !== JSON.stringify(candidateAfter.services)) {
      constrained.services = JSON.parse(JSON.stringify(before.services));
      rejectedModifications.push(
        'Unrelated modifications to clinic services and consultation fees reverted'
      );
    }
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
  const explicitSafetyBypass =
    lower.includes('remove safety') || lower.includes('allow medical advice');
  if (!explicitSafetyBypass) {
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
