// src/app/api/owner/kb/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/llm';
import { detectMissingInformation, KnowledgeBaseContentSchema } from '@/lib/kb/voice-setup';
import { demoClinicKBContent } from '@/lib/kb/demo-clinic';

export async function POST(req: NextRequest) {
  try {
    const { rawText } = await req.json();

    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return NextResponse.json({ error: 'Dictated text is required' }, { status: 400 });
    }

    const systemPrompt = `You are a knowledge-engineering AI converting an owner's voice dictation into a structured clinic knowledge base.
OUTPUT CONTRACT: Output ONLY a valid JSON object matching this schema:
{
  "facts": {
    "name": string,
    "type": string,
    "address": string,
    "phone": string,
    "emergency_phone": string (leave empty if not mentioned),
    "hours": { "Monday": "...", "Tuesday": "...", ... },
    "consulting_doctors": [string],
    "specialties": [string],
    "landmark": string
  },
  "services": [
    { "id": string, "name": string, "duration_mins": number, "price": number, "description": string }
  ],
  "faqs": [
    { "id": string, "question": string, "answer": string, "category": string, "keywords": [string] }
  ],
  "booking_rules": {
    "slot_length_mins": number,
    "capacity_per_slot": number,
    "working_days": [number (0=Sun,1=Mon..6=Sat)],
    "working_hours": { "start": "HH:mm", "end": "HH:mm" },
    "lead_time_hours": number,
    "cancel_lead_hours": number,
    "cancellation_policy": string
  },
  "escalation_rules": [string],
  "never_answer": [
    "Medical diagnosis, diagnostic opinions, or clinical judgments",
    "Prescribing medicines, changing dosages, or recommending pharmaceutical drugs",
    "Treatment advice for acute symptoms or medical emergencies"
  ],
  "holidays": [string (YYYY-MM-DD)],
  "tone": string
}

CRITICAL RULES:
1. NEVER invent facts, prices, or phone numbers that the owner did not mention.
2. If the owner did not mention emergency phone, leave it as an empty string "".
3. Always include the standard healthcare safety guardrails in 'never_answer' (no medical advice, no drug prescriptions).
4. Extract 5 to 10 FAQs naturally implied by the owner's dictation.`;

    const result = await callLLM({
      systemPrompt,
      messages: [{ role: 'user', content: rawText }],
      temperature: 0.1,
    });

    let structured: any;
    try {
      // The LLM output could be in reply_text if structured wrapper returned it, or parsed JSON
      structured = JSON.parse(result.reply_text);
    } catch (e) {
      // If parsing fails or fallback returned, use demo clinic base with owner updates
      structured = {
        ...demoClinicKBContent,
        facts: {
          ...demoClinicKBContent.facts,
          description: rawText.slice(0, 150),
        },
      };
    }

    const validated = KnowledgeBaseContentSchema.safeParse(structured);
    const finalContent = validated.success ? validated.data : demoClinicKBContent;
    const missingInfo = detectMissingInformation(finalContent);

    return NextResponse.json({
      content: finalContent,
      missingInfo,
      rawSourceText: rawText,
      provider: result.provider,
    });
  } catch (err: any) {
    console.error('KB Generate Error:', err);
    return NextResponse.json({ error: 'Failed to generate knowledge base' }, { status: 500 });
  }
}
