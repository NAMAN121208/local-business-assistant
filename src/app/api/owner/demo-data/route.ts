// src/app/api/owner/demo-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';
import { getClinicNow } from '@/lib/booking';

export async function POST(req: NextRequest) {
  try {
    const now = getClinicNow('Asia/Kolkata');
    const nowIso = new Date().toISOString();

    // 1. Seed Demo Conversation 1: Answered (FAQ)
    const cust1 = await db.upsertCustomer({
      id: 'cust_demo_faq',
      business_id: DEMO_CLINIC_ID,
      name: 'Ananya Sharma (Demo)',
      contact: '+91 98111 22233',
      preferred_language: 'en',
      first_seen_at: nowIso,
    });

    const conv1 = await db.getOrCreateConversation(
      DEMO_CLINIC_ID,
      cust1.id,
      'web',
      'conv_demo_answered'
    );
    await db.updateConversationStatus(conv1.id, 'resolved');

    await db.createMessage({
      conversation_id: conv1.id,
      sender: 'customer',
      text: 'What is the consultation fee for Dr. Sneha Rao and what are the clinic hours?',
      language: 'en',
    });

    await db.createMessage({
      conversation_id: conv1.id,
      sender: 'bot',
      text: 'Dr. Sneha Rao (Senior General Physician) consultation fee is ₹500 (30 mins). Our clinic is open Monday to Saturday from 09:00 AM to 01:00 PM and 04:00 PM to 08:00 PM. Sundays are closed for routine OPD.',
      language: 'en',
      intent: 'faq',
      decision: 'answer',
      confidence: 0.98,
      kb_refs: ['srv_gen_consult', 'faq_hours'],
      provider: 'gemini',
    });

    // 2. Seed Demo Conversation 2: Confirmed Booking
    const cust2 = await db.upsertCustomer({
      id: 'cust_demo_booking',
      business_id: DEMO_CLINIC_ID,
      name: 'Rahul Verma (Demo)',
      contact: '+91 98222 33344',
      preferred_language: 'en',
      first_seen_at: nowIso,
    });

    const conv2 = await db.getOrCreateConversation(
      DEMO_CLINIC_ID,
      cust2.id,
      'web',
      'conv_demo_booked'
    );
    await db.updateConversationStatus(conv2.id, 'open');

    await db.createMessage({
      conversation_id: conv2.id,
      sender: 'customer',
      text: 'Can I book a consultation tomorrow morning for Rahul Verma?',
      language: 'en',
    });

    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const demoBooking = await db.createBooking({
      id: 'bk_demo_judge_101',
      business_id: DEMO_CLINIC_ID,
      customer_id: cust2.id,
      service: 'General Physician Consultation (Dr. Sneha Rao)',
      start_time: `${tomorrowStr}T10:00:00.000Z`,
      end_time: `${tomorrowStr}T10:30:00.000Z`,
      status: 'confirmed',
      notes: 'Demo booking for Judge review',
    });

    await db.createMessage({
      conversation_id: conv2.id,
      sender: 'bot',
      text: `Your appointment has been confirmed!\n\nBooking ID: ${demoBooking.id.toUpperCase()}\nService: General Physician Consultation (Dr. Sneha Rao)\nDate: ${tomorrowStr}\nTime: 10:00 AM\nLocation: City Health Clinic, 42 1st Main, Indiranagar.`,
      language: 'en',
      intent: 'booking_create',
      decision: 'act',
      confidence: 1.0,
      kb_refs: ['booking_rules'],
      provider: 'deterministic_booking_engine',
    });

    // 3. Seed Demo Conversation 3: Escalated (Medical Advice Guardrail Triggered)
    const cust3 = await db.upsertCustomer({
      id: 'cust_demo_escalated',
      business_id: DEMO_CLINIC_ID,
      name: 'Pooja Hegde (Demo)',
      contact: '+91 98333 44455',
      preferred_language: 'hi',
      first_seen_at: nowIso,
    });

    const conv3 = await db.getOrCreateConversation(
      DEMO_CLINIC_ID,
      cust3.id,
      'web',
      'conv_demo_escalated'
    );
    await db.updateConversationStatus(conv3.id, 'needs_human');

    await db.createMessage({
      conversation_id: conv3.id,
      sender: 'customer',
      text: 'Mera 3 saal ka beta hai, use 103 bukhar hai aur ulti ho rahi hai, kaunsi dawai du?',
      language: 'hi',
    });

    await db.createEscalation({
      id: 'esc_demo_judge_101',
      conversation_id: conv3.id,
      reason: 'Medical prescription and acute paediatric dosage requested (never-answer rule)',
      ai_summary:
        'Mother asking for fever and vomiting medication dosage for a 3-year-old child with 103F fever.',
      suggested_reply:
        'Please advise patient to bring child immediately to paediatric emergency or Dr. Arvind Kumar; do not self-medicate.',
      status: 'open',
    });

    await db.createMessage({
      conversation_id: conv3.id,
      sender: 'bot',
      text: 'City Health Clinic chat par dawai ya medical advice provide nahi karta hai. Kisi bhi emergency ke liye kripya hamari 24/7 helpline +91 98765 99999 par call karein ya turant clinic aayein. Doctor consultation book karne ke liye main aapki madad kar sakta hoon.',
      language: 'hi',
      intent: 'sensitive_or_out_of_scope',
      decision: 'escalate',
      confidence: 1.0,
      kb_refs: ['never_answer_medical_advice'],
      provider: 'deterministic_guardrail',
    });

    // 4. Seed Demo Conversation 4: Resolved by Owner
    const cust4 = await db.upsertCustomer({
      id: 'cust_demo_owner_resolved',
      business_id: DEMO_CLINIC_ID,
      name: 'Kiran Gowda (Demo)',
      contact: '+91 98444 55566',
      preferred_language: 'kn',
      first_seen_at: nowIso,
    });

    const conv4 = await db.getOrCreateConversation(
      DEMO_CLINIC_ID,
      cust4.id,
      'web',
      'conv_demo_owner_resolved'
    );
    await db.updateConversationStatus(conv4.id, 'resolved');

    await db.createMessage({
      conversation_id: conv4.id,
      sender: 'customer',
      text: 'Is four-wheeler car parking available at the clinic premises?',
      language: 'en',
    });

    await db.createMessage({
      conversation_id: conv4.id,
      sender: 'owner',
      text: 'Hello Kiran, we have dedicated two-wheeler parking in front of the clinic. For cars, street parking is easily available along 7th Cross opposite the BDA Complex.',
      language: 'en',
      provider: 'owner_manual',
    });

    return NextResponse.json({
      success: true,
      message: 'Demo conversations loaded successfully! 4 judge-ready conversations populated.',
    });
  } catch (err: any) {
    console.error('Seed Demo Data Error:', err);
    return NextResponse.json({ error: 'Failed to seed demo data' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Reset demo conversations
    const demoConvIds = [
      'conv_demo_answered',
      'conv_demo_booked',
      'conv_demo_escalated',
      'conv_demo_owner_resolved',
    ];

    for (const id of demoConvIds) {
      const conv = await db.getConversation(id);
      if (conv) {
        await db.updateConversationStatus(id, 'resolved');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Demo data reset successfully.',
    });
  } catch (err: any) {
    console.error('Reset Demo Data Error:', err);
    return NextResponse.json({ error: 'Failed to reset demo data' }, { status: 500 });
  }
}
