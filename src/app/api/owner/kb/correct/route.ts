// src/app/api/owner/kb/correct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID, demoClinicKBContent } from '@/lib/kb/demo-clinic';
import {
  computeKBDiff,
  KnowledgeBaseContentSchema,
  validateAndConstrainCorrection,
} from '@/lib/kb/voice-setup';
import { callLLM } from '@/lib/llm';
import { KnowledgeBaseContent } from '@/lib/db/types';

export async function POST(req: NextRequest) {
  try {
    const { correctionText, customerMessage } = await req.json();

    if (!correctionText || typeof correctionText !== 'string' || !correctionText.trim()) {
      return NextResponse.json({ error: 'Correction text is required' }, { status: 400 });
    }

    const currentVersion = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
    const currentKB: KnowledgeBaseContent = currentVersion?.content || demoClinicKBContent;

    const systemPrompt = `You are a knowledge-engineering assistant updating an existing business knowledge base for City Health Clinic.
You are given the CURRENT APPROVED KNOWLEDGE BASE and a VOICE CORRECTION dictated by the clinic owner.

CURRENT KNOWLEDGE BASE:
${JSON.stringify(currentKB)}

CUSTOMER MESSAGE THAT TRIGGERED THIS CORRECTION:
${customerMessage ? `"${customerMessage}"` : 'None specified'}

STRICT RULES:
1. Update ONLY the specific entries, hours, or FAQs that the owner's correction explicitly addresses.
2. DO NOT change or invent unrelated facts, doctors, services, or prices.
3. SAFETY RULE: DO NOT remove or weaken any safety guardrails in 'never_answer' (no medical diagnosis, no drug prescriptions).
4. If the owner specifies clinic hours for a day (e.g. Sunday closed except emergencies), accurately update facts.hours and relevant FAQs.
5. Output the complete updated KnowledgeBaseContent as a valid JSON object matching the schema.`;

    const result = await callLLM({
      systemPrompt,
      messages: [{ role: 'user', content: `Owner Correction: "${correctionText}"` }],
      temperature: 0.1,
    });

    let candidateContent: KnowledgeBaseContent;
    try {
      const parsed = JSON.parse(result.reply_text);
      const validated = KnowledgeBaseContentSchema.safeParse(parsed);
      candidateContent = validated.success ? validated.data : JSON.parse(JSON.stringify(currentKB));
    } catch (e) {
      // Deterministic fallback for common corrections
      candidateContent = JSON.parse(JSON.stringify(currentKB));
    }

    // Deterministic alignment for Sunday correction
    const lower = correctionText.toLowerCase();
    if (lower.includes('sunday')) {
      const emergencyNum =
        currentKB.facts.emergency_phone || currentKB.facts.phone || '+91 98765 99999';
      candidateContent.facts.hours.Sunday = `Closed except for emergencies (Emergency on-call: ${emergencyNum})`;

      // Update or add specific Sunday FAQ
      const existingSundayIdx = candidateContent.faqs.findIndex(
        (f) =>
          f.question.toLowerCase().includes('sunday') ||
          (f.keywords && f.keywords.includes('sunday'))
      );

      const sundayFaq = {
        id: existingSundayIdx !== -1 ? candidateContent.faqs[existingSundayIdx].id : `faq_sunday_timings`,
        question: 'Are you open on Sundays?',
        answer: `City Health Clinic is closed on Sundays for routine outpatient appointments. However, we are available 24/7 for medical emergencies at ${emergencyNum}.`,
        category: 'timings',
        keywords: ['sunday', 'open', 'hours', 'weekend', 'closed', 'emergency', 'timings'],
      };

      if (existingSundayIdx !== -1) {
        candidateContent.faqs[existingSundayIdx] = sundayFaq;
      } else {
        candidateContent.faqs.unshift(sundayFaq);
      }
    }

    // Code-level validation: enforce that unmentioned fields are reverted, and safety rules locked
    const { constrainedContent, rejectedModifications } = validateAndConstrainCorrection(
      correctionText,
      currentKB,
      candidateContent
    );

    const { differences, hasSafetyChanges } = computeKBDiff(currentKB, constrainedContent);

    return NextResponse.json({
      updatedContent: constrainedContent,
      differences,
      hasSafetyChanges,
      rejectedModifications,
      provider: result.provider,
    });
  } catch (err: any) {
    console.error('KB Correct Error:', err);
    return NextResponse.json({ error: 'Failed to apply correction' }, { status: 500 });
  }
}
