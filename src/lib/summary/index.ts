// src/lib/summary/index.ts
import { DailySummaryMetrics } from '../db/types';
import { callLLM } from '../llm';

/**
 * Validates that every number appearing in the generated highlights text
 * actually exists in the computed metrics data (preventing hallucinations).
 */
export function validateSummaryNumbers(
  highlightsText: string,
  metrics: DailySummaryMetrics
): boolean {
  // Extract all standalone numbers (integers or decimals, optionally with %)
  const numberMatches = highlightsText.match(/\b\d+(?:\.\d+)?%?\b/g) || [];

  const allowedNumbers = new Set<string>();

  // Add all numbers from computed metrics
  allowedNumbers.add(String(metrics.totalConversations));
  allowedNumbers.add(String(metrics.bookingsCreated));
  allowedNumbers.add(String(metrics.bookingsCancelled));
  allowedNumbers.add(String(metrics.openEscalations));
  allowedNumbers.add(String(metrics.autoResolvedCount));
  allowedNumbers.add(String(metrics.autoResolvedPercent));
  allowedNumbers.add(`${metrics.autoResolvedPercent}%`);
  allowedNumbers.add(String(metrics.escalatedCount));
  allowedNumbers.add(String(metrics.escalatedPercent));
  allowedNumbers.add(`${metrics.escalatedPercent}%`);

  for (const item of metrics.topIntents) {
    allowedNumbers.add(String(item.count));
  }
  for (const item of metrics.topQuestions) {
    allowedNumbers.add(String(item.count));
  }

  // Also permit common date numbers if today date appears (e.g. 2026, 24, 7 for 24/7 or 7 days)
  allowedNumbers.add('2026');
  allowedNumbers.add('24');
  allowedNumbers.add('7');
  allowedNumbers.add('100');
  allowedNumbers.add('100%');
  allowedNumbers.add('0');
  allowedNumbers.add('0%');

  for (const match of numberMatches) {
    const clean = match.trim();
    if (!allowedNumbers.has(clean)) {
      console.warn(`[Summary Hallucination Flag] Number "${clean}" in summary highlights was not found in computed metrics!`);
      return false;
    }
  }

  return true;
}

/**
 * Generates a concise, factual highlights paragraph for the owner daily summary.
 * Strictly constrained to the provided computed metrics.
 */
export async function generateHighlights(
  dateStr: string,
  metrics: DailySummaryMetrics
): Promise<string> {
  const prompt = `You are the executive reporting assistant for City Health Clinic.
Date: ${dateStr} (Asia/Kolkata timezone).

COMPUTED CLINIC METRICS (Ground Truth):
- Total Customer Conversations: ${metrics.totalConversations}
- Appointments Created: ${metrics.bookingsCreated}
- Appointments Cancelled: ${metrics.bookingsCancelled}
- Open Escalations Requiring Staff: ${metrics.openEscalations}
- Automatically Resolved: ${metrics.autoResolvedPercent}% (${metrics.autoResolvedCount} conversations)
- Escalated to Clinic Team: ${metrics.escalatedPercent}% (${metrics.escalatedCount} conversations)
- Top Customer Intents: ${metrics.topIntents.map((i) => `${i.intent} (${i.count})`).join(', ') || 'None'}

STRICT ACCURACY RULES:
1. Write a 2 to 3 sentence executive highlights paragraph for the clinic owner.
2. Mention ONLY the facts and figures provided above.
3. Every single number you write MUST be present in the computed metrics above. DO NOT invent, estimate, or extrapolate any numbers or percentages.
4. Output plain text only.`;

  try {
    const res = await callLLM({
      systemPrompt: prompt,
      messages: [{ role: 'user', content: `Please summarize today's clinic metrics.` }],
      temperature: 0.1,
    });

    if (res.provider !== 'fallback' && res.reply_text) {
      const candidateText = res.reply_text.trim();
      const isNumbersValid = validateSummaryNumbers(candidateText, metrics);
      if (isNumbersValid) {
        return candidateText;
      }
      console.warn('[Summary Fallback] LLM highlights failed strict numerical validation. Using verified deterministic synthesis.');
    }
  } catch (err) {
    console.warn('[Summary Fallback] LLM highlights call error:', err);
  }

  // Deterministic synthesis strictly bound to computed metrics
  if (metrics.totalConversations === 0 && metrics.bookingsCreated === 0) {
    return `City Health Clinic recorded 0 patient conversations and 0 bookings on ${dateStr}. System operations remained stable with 0 open escalations.`;
  }

  return `City Health Clinic handled ${metrics.totalConversations} customer conversations with an auto-resolution rate of ${metrics.autoResolvedPercent}%. A total of ${metrics.bookingsCreated} appointments were created (${metrics.bookingsCancelled} cancelled), while ${metrics.openEscalations} escalations currently await clinic staff follow-up.`;
}
