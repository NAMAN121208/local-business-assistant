// src/app/api/owner/kb/correct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID, demoClinicKBContent } from '@/lib/kb/demo-clinic';
import {
  applySemanticCorrectionFallback,
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
4. If the owner specifies clinic hours for any day, accurately update facts.hours and relevant FAQs.
5. Output the complete updated KnowledgeBaseContent as a valid JSON object matching the schema.`;

    const result = await callLLM({
      systemPrompt,
      messages: [{ role: 'user', content: `Owner Correction: "${correctionText}"` }],
      temperature: 0.1,
    });

    let candidateContent: KnowledgeBaseContent;
    if (result.provider !== 'fallback') {
      try {
        const parsed = JSON.parse(result.reply_text);
        const validated = KnowledgeBaseContentSchema.safeParse(parsed);
        candidateContent = validated.success
          ? validated.data
          : applySemanticCorrectionFallback(correctionText, currentKB);
      } catch (e) {
        candidateContent = applySemanticCorrectionFallback(correctionText, currentKB);
      }
    } else {
      // General semantic interpreter when LLM is offline or in fallback mode
      candidateContent = applySemanticCorrectionFallback(correctionText, currentKB);
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
