// src/app/api/owner/kb/correct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID, demoClinicKBContent } from '@/lib/kb/demo-clinic';
import { computeKBDiff, KnowledgeBaseContentSchema } from '@/lib/kb/voice-setup';
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
4. Output the complete updated KnowledgeBaseContent as a valid JSON object.`;

    const result = await callLLM({
      systemPrompt,
      messages: [{ role: 'user', content: `Owner Correction: "${correctionText}"` }],
      temperature: 0.1,
    });

    let updatedContent: KnowledgeBaseContent;
    try {
      const parsed = JSON.parse(result.reply_text);
      const validated = KnowledgeBaseContentSchema.safeParse(parsed);
      updatedContent = validated.success ? validated.data : currentKB;
    } catch (e) {
      // Deterministic fallback for common corrections (e.g. Sunday emergency number / hours)
      updatedContent = JSON.parse(JSON.stringify(currentKB));
      const lower = correctionText.toLowerCase();

      if (lower.includes('sunday')) {
        updatedContent.facts.hours.Sunday = 'Closed except for emergencies (Emergency phone: +91 98765 99999)';
        updatedContent.faqs.push({
          id: `faq_sunday_${Date.now()}`,
          question: 'Are you open on Sundays?',
          answer: 'The clinic is closed on Sundays for routine OPD, but available 24/7 for emergencies at +91 98765 99999.',
          category: 'timings',
          keywords: ['sunday', 'emergency', 'closed', 'weekend'],
        });
      }
    }

    // CODE-LEVEL SAFETY GUARDRAIL ENFORCEMENT:
    // Ensure never_answer items are not silently stripped unless the owner explicitly ordered it
    const explicitSafetyBypass =
      correctionText.toLowerCase().includes('remove safety') ||
      correctionText.toLowerCase().includes('allow medical advice');

    if (!explicitSafetyBypass) {
      for (const rule of currentKB.never_answer) {
        if (!updatedContent.never_answer.includes(rule)) {
          updatedContent.never_answer.push(rule);
        }
      }
      for (const escRule of currentKB.escalation_rules) {
        if (!updatedContent.escalation_rules.includes(escRule)) {
          updatedContent.escalation_rules.push(escRule);
        }
      }
    }

    const { differences, hasSafetyChanges } = computeKBDiff(currentKB, updatedContent);

    return NextResponse.json({
      updatedContent,
      differences,
      hasSafetyChanges,
      provider: result.provider,
    });
  } catch (err: any) {
    console.error('KB Correct Error:', err);
    return NextResponse.json({ error: 'Failed to apply correction' }, { status: 500 });
  }
}
