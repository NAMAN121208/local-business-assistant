// src/app/api/owner/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';
import { getClinicNow } from '@/lib/booking';
import { generateHighlights } from '@/lib/summary';
import { DailySummary } from '@/lib/db/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const now = getClinicNow('Asia/Kolkata');
    const date = searchParams.get('date') || now.dateStr;

    // 1. Get summary for requested date
    let summary = await db.getDailySummary(DEMO_CLINIC_ID, date);

    // If summary not generated yet for today, compute it on the fly
    if (!summary) {
      const { metrics, unansweredQuestions } = await db.computeDailyMetrics(
        DEMO_CLINIC_ID,
        date
      );
      const highlights = await generateHighlights(date, metrics);

      summary = {
        id: `ds_${date}_${Date.now()}`,
        business_id: DEMO_CLINIC_ID,
        date,
        metrics,
        highlights,
        unanswered_questions: unansweredQuestions,
        created_at: new Date().toISOString(),
      };
    }

    // 2. Fetch past 7 days history
    const history = await db.getRecentDailySummaries(DEMO_CLINIC_ID, 7);

    return NextResponse.json({
      summary,
      history,
    });
  } catch (err: any) {
    console.error('Daily Summary GET Error:', err);
    return NextResponse.json({ error: 'Failed to fetch daily summary' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const now = getClinicNow('Asia/Kolkata');
    const date = body.date || now.dateStr;

    const { metrics, unansweredQuestions } = await db.computeDailyMetrics(
      DEMO_CLINIC_ID,
      date
    );
    const highlights = await generateHighlights(date, metrics);

    const summary: DailySummary = {
      id: `ds_${date}_${Date.now()}`,
      business_id: DEMO_CLINIC_ID,
      date,
      metrics,
      highlights,
      unanswered_questions: unansweredQuestions,
      created_at: new Date().toISOString(),
    };

    await db.saveDailySummary(summary);
    const history = await db.getRecentDailySummaries(DEMO_CLINIC_ID, 7);

    return NextResponse.json({
      success: true,
      summary,
      history,
    });
  } catch (err: any) {
    console.error('Daily Summary POST Error:', err);
    return NextResponse.json({ error: 'Failed to generate daily summary' }, { status: 500 });
  }
}
