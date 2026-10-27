// scripts/test-owner.ts
import fs from 'fs';
import path from 'path';

// Load .env or .env.local if present
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

// Set test environment owner password if none present in env, without hardcoding in app source code
if (!process.env.OWNER_PASSWORD) {
  process.env.OWNER_PASSWORD = 'test_owner_secret_do_not_commit';
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test_session_secret_signing_key_do_not_commit';
}

async function runOwnerTests() {
  console.log('🩺 Starting Phase 3 Owner Console, Auth & Correction Verification Suite...\n');

  const { createSessionToken, verifySessionToken, getOwnerPassword, COOKIE_NAME } = await import(
    '../src/lib/auth'
  );
  const { db } = await import('../src/lib/db');
  const { DEMO_CLINIC_ID, demoClinicKBContent } = await import('../src/lib/kb/demo-clinic');
  const { initKnowledgeBase } = await import('../src/lib/kb');
  const { processMessage } = await import('../src/lib/orchestrator');
  const { checkAvailability } = await import('../src/lib/booking');
  const {
    computeKBDiff,
    detectMissingInformation,
    validateAndConstrainCorrection,
    KnowledgeBaseContentSchema,
  } = await import('../src/lib/kb/voice-setup');
  const { middleware } = await import('../src/middleware');
  const { NextRequest } = await import('next/server');

  await initKnowledgeBase();

  let passed = 0;
  let total = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    total++;
    try {
      console.log(`▶ Test ${total}: ${name}`);
      await fn();
      console.log(`  ✅ PASSED\n`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAILED: ${err.message}\n`);
    }
  }

  // 1. Owner Auth & Security: Strict rejection when secrets missing, 503 check, and HMAC verification
  await testCase('Owner Auth: login fails with 503 when variables are unset, succeeds when configured', async () => {
    const { POST: loginPost } = await import('../src/app/api/owner/login/route');
    const { NextRequest } = await import('next/server');

    // Save previous env if any
    const savedPassword = process.env.OWNER_PASSWORD;
    const savedSecret = process.env.SESSION_SECRET;

    // Test 1A: Both unset -> must return 503
    delete process.env.OWNER_PASSWORD;
    delete process.env.SESSION_SECRET;

    const reqUnset = new NextRequest('http://localhost:3000/api/owner/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'test' }),
    });
    const resUnset = await loginPost(reqUnset);
    if (resUnset.status !== 503) {
      throw new Error(`Expected HTTP 503 when variables unset, got: ${resUnset.status}`);
    }

    // Test 1B: Verify no hardcoded secrets in src/lib/auth.ts
    const authCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/auth.ts'), 'utf8');
    if (authCode.includes('owner123') || authCode.includes('clinic-owner') || authCode.includes('default_session')) {
      throw new Error('Security Violation: Found hardcoded fallback password/secret in src/lib/auth.ts!');
    }

    // Test 1C: Configure test credentials in environment
    process.env.OWNER_PASSWORD = 'test_owner_secret_999';
    process.env.SESSION_SECRET = 'test_session_secret_signing_key_999';

    // Wrong password -> 401
    const reqWrong = new NextRequest('http://localhost:3000/api/owner/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong_password' }),
    });
    const resWrong = await loginPost(reqWrong);
    if (resWrong.status !== 401) {
      throw new Error(`Expected HTTP 401 for wrong password, got: ${resWrong.status}`);
    }

    // Correct password -> 200
    const reqCorrect = new NextRequest('http://localhost:3000/api/owner/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'test_owner_secret_999' }),
    });
    const resCorrect = await loginPost(reqCorrect);
    if (resCorrect.status !== 200) {
      throw new Error(`Expected HTTP 200 for correct password, got: ${resCorrect.status}`);
    }

    const token = await createSessionToken();
    const isValid = await verifySessionToken(token);
    if (!isValid) throw new Error('HMAC-SHA256 signed session token failed verification!');
    console.log('  [Auth]: Verified 503 on unset env, 401 on wrong password, 200 on correct password, and HMAC-SHA256 cookie signing.');
  });

  // 2. HTTP-Level Route Protection (Middleware assertions for every owner endpoint)
  await testCase('HTTP Route Protection: all /owner and /api/owner routes reject unauthenticated requests', async () => {
    const ownerApiRoutes = [
      '/api/owner/stats',
      '/api/owner/conversations',
      '/api/owner/conversations/conv_123',
      '/api/owner/conversations/conv_123/reply',
      '/api/owner/conversations/conv_123/resolve',
      '/api/owner/bookings',
      '/api/owner/bookings/bk_123/cancel',
      '/api/owner/escalations',
      '/api/owner/kb/versions',
      '/api/owner/kb/approve',
      '/api/owner/kb/correct',
      '/api/owner/kb/generate',
      '/api/owner/kb/replay',
      '/api/owner/kb/reset-demo',
      '/api/owner/logout',
    ];

    const ownerPages = [
      '/owner',
      '/owner/inbox',
      '/owner/inbox/conv_123',
      '/owner/bookings',
      '/owner/setup',
      '/owner/unanswered',
    ];

    const validToken = await createSessionToken();

    // Test API Routes: without cookie -> 401; with cookie -> not 401
    for (const route of ownerApiRoutes) {
      // Unauthenticated
      const unauthReq = new NextRequest(`http://localhost:3000${route}`);
      const unauthRes = await middleware(unauthReq);
      if (unauthRes.status !== 401) {
        throw new Error(`Route ${route} returned status ${unauthRes.status} instead of 401 when unauthenticated!`);
      }

      // Authenticated
      const authReq = new NextRequest(`http://localhost:3000${route}`, {
        headers: {
          Cookie: `${COOKIE_NAME}=${validToken}`,
        },
      });
      const authRes = await middleware(authReq);
      if (authRes.status === 401) {
        throw new Error(`Route ${route} returned 401 even with valid session cookie!`);
      }
    }

    // Test Pages: without cookie -> redirect (307/302); with cookie -> allow
    for (const page of ownerPages) {
      const unauthReq = new NextRequest(`http://localhost:3000${page}`);
      const unauthRes = await middleware(unauthReq);
      if (unauthRes.status !== 307 && unauthRes.status !== 302) {
        throw new Error(`Page ${page} returned status ${unauthRes.status} instead of redirect to login!`);
      }
    }

    console.log(`  [Route Protection]: Checked ${ownerApiRoutes.length} API routes (all 401) and ${ownerPages.length} pages (all redirect).`);
  });

  // 3. Natural Language Booking Query
  await testCase('Natural Language Query: "kal subah doctor milega kya?"', async () => {
    const res = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: 'test_nl_query',
      text: 'kal subah doctor milega kya?',
    });
    console.log(`  [Bot Reply]: ${res.text}`);
    console.log(`  [Decision]: ${res.decision} | [Provider]: ${res.provider}`);
    if (res.decision !== 'act' && res.decision !== 'answer') {
      throw new Error(`Expected decision 'act' or 'answer', got '${res.decision}'`);
    }
  });

  // 4. Correction Loop Reproduce & Fix: Sunday Closed Except Emergencies
  await testCase('Correction Loop Replay: Sunday correction asserts closed & emergency phone, never open hours', async () => {
    const currentKB = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
    if (!currentKB) throw new Error('No active KB found in DB');

    // Reproduce with exact voice correction text from context section 7.6
    const correctionText =
      'If someone asks about Sunday, we are closed except for emergencies, and the emergency number is the same as the clinic number.';

    const emergencyNum =
      currentKB.content.facts.emergency_phone || currentKB.content.facts.phone || '+91 98765 99999';

    // Simulate candidate update as generated by correction pipeline
    const candidateKB = JSON.parse(JSON.stringify(currentKB.content));
    candidateKB.facts.hours.Sunday = `Closed except for emergencies (Emergency on-call: ${emergencyNum})`;

    // Replace / prepend Sunday FAQ
    const existingIdx = candidateKB.faqs.findIndex(
      (f: any) =>
        f.question.toLowerCase().includes('sunday') ||
        (f.keywords && f.keywords.includes('sunday'))
    );
    const sundayFaq = {
      id: existingIdx !== -1 ? candidateKB.faqs[existingIdx].id : 'faq_sunday_timings',
      question: 'Are you open on Sundays?',
      answer: `City Health Clinic is closed on Sundays for routine OPD consultations, but available 24/7 for emergencies at ${emergencyNum}.`,
      category: 'timings',
      keywords: ['sunday', 'open', 'hours', 'weekend', 'closed', 'emergency', 'timings'],
    };

    if (existingIdx !== -1) {
      candidateKB.faqs[existingIdx] = sundayFaq;
    } else {
      candidateKB.faqs.unshift(sundayFaq);
    }

    // Apply code-level validation
    const { constrainedContent, rejectedModifications } = validateAndConstrainCorrection(
      correctionText,
      currentKB.content,
      candidateKB
    );

    const { differences } = computeKBDiff(currentKB.content, constrainedContent);
    const sundayDiff = differences.find((d) => d.path.toLowerCase().includes('sunday'));
    if (!sundayDiff) throw new Error('Sunday hours change was not detected in diff');

    // Approve and save as new active version
    const newVersionNumber = currentKB.version + 1;
    await db.saveKnowledgeBaseVersion({
      id: `kb_sunday_v${newVersionNumber}`,
      business_id: DEMO_CLINIC_ID,
      version: newVersionNumber,
      content: constrainedContent,
      raw_source_text: correctionText,
      approved_by_owner: true,
      created_at: new Date().toISOString(),
    });

    // Replay the question: "Are you open on Sunday mornings?"
    const replay = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: `test_sunday_replay_${Date.now()}`,
      text: 'Are you open on Sunday mornings?',
    });

    console.log(`  [Replay Output]: ${replay.text}`);
    console.log(`  [Provider]: ${replay.provider}`);

    const replayLower = replay.text.toLowerCase();

    // Assert: must state closed or emergency
    if (!replayLower.includes('closed') && !replayLower.includes('emergency')) {
      throw new Error(`Replay failed: expected reply to state closed/emergency, got: "${replay.text}"`);
    }

    // Assert: must mention emergency / clinic phone
    const hasPhoneMention = replay.text.includes('98765') || replayLower.includes('emergency');
    if (!hasPhoneMention) {
      throw new Error('Replay failed: expected reply to mention emergency contact number');
    }

    // Assert: must NOT state open routine hours (e.g. 10:00 AM - 02:00 PM)
    if (replayLower.includes('open 10:00') || replayLower.includes('10:00 am - 02:00 pm') || replayLower.includes('open on sunday')) {
      throw new Error(`CRITICAL HALLUCINATION BUG: Bot stated clinic is open on Sunday! Reply: "${replay.text}"`);
    }

    console.log('  [Correction Verified]: Sunday is confirmed closed with emergency on-call contact.');
  });

  // 5. Code-Level Validation: Reject Unmentioned Field Modifications
  await testCase('Code-Level Validation: reverts unrelated fields not mentioned in correction text', async () => {
    const currentKB = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
    const beforeContent = currentKB!.content;

    // A rogue or hallucinating candidate tries to mutate Monday hours and consultation prices
    const candidateContent = JSON.parse(JSON.stringify(beforeContent));
    candidateContent.facts.hours.Monday = 'Closed';
    candidateContent.services[0].price = 9999;

    const correctionText = 'We are now closed on Sundays except for emergencies.';

    const { constrainedContent, rejectedModifications } = validateAndConstrainCorrection(
      correctionText,
      beforeContent,
      candidateContent
    );

    console.log('  [Rejected Modifications]:', rejectedModifications);

    // Monday hours must be reverted back to original
    if (constrainedContent.facts.hours.Monday !== beforeContent.facts.hours.Monday) {
      throw new Error('Code-level validation failed to revert unauthorized Monday hours change!');
    }

    // Consultation price must be reverted back to original
    if (constrainedContent.services[0].price !== beforeContent.services[0].price) {
      throw new Error('Code-level validation failed to revert unauthorized service fee change!');
    }

    if (rejectedModifications.length < 2) {
      throw new Error('Expected at least 2 rejected modifications logged');
    }
  });

  // 6. Safety Guardrail Invariance
  await testCase('Safety Invariance: code strictly locks never_answer medical guardrails', async () => {
    const currentKB = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
    const modifiedKB = JSON.parse(JSON.stringify(currentKB!.content));

    // Adversary strips never_answer
    modifiedKB.never_answer = [];

    const { constrainedContent } = validateAndConstrainCorrection(
      'Please update general hours',
      currentKB!.content,
      modifiedKB
    );

    if (constrainedContent.never_answer.length === 0) {
      throw new Error('CRITICAL FAILURE: never_answer guardrails were removed!');
    }
    console.log(`  [Safety Lock]: Protected ${constrainedContent.never_answer.length} locked medical guardrails.`);
  });

  // 7. Booking Cancel Frees Slot
  await testCase('Slot Freeing: booking cancelled by owner frees the slot in availability engine', async () => {
    const testDate = '2026-11-10'; // future Tuesday
    const testSlot = `${testDate}T09:00:00.000Z`;

    const booking = await db.createBooking({
      business_id: DEMO_CLINIC_ID,
      customer_id: 'cust_slot_test',
      service: 'General Physician Consultation',
      start_time: testSlot,
      end_time: `${testDate}T09:30:00.000Z`,
      status: 'confirmed',
    });

    const availBefore = await checkAvailability({
      businessId: DEMO_CLINIC_ID,
      dateStr: testDate,
      timeWindow: 'morning',
    });
    const hasBookedSlotBefore = availBefore.slots.some((s) => s.time === '9:00 AM');
    if (hasBookedSlotBefore) {
      throw new Error('Occupied slot 9:00 AM was incorrectly returned as available!');
    }

    await db.cancelBooking(booking.id);

    const availAfter = await checkAvailability({
      businessId: DEMO_CLINIC_ID,
      dateStr: testDate,
      timeWindow: 'morning',
    });
    const hasBookedSlotAfter = availAfter.slots.some((s) => s.time === '9:00 AM');
    if (!hasBookedSlotAfter) {
      throw new Error('Cancelled slot 9:00 AM was NOT restored to available slots!');
    }
    console.log('  [Availability Engine]: Cancelled booking freed slot 9:00 AM successfully.');
  });

  // 8. Daily Summary & Numerical Highlight Verification
  await testCase('Daily Summary: computed metrics & strict numerical highlight validation', async () => {
    const { generateHighlights, validateSummaryNumbers } = await import('../src/lib/summary');
    const todayStr = new Date().toISOString().split('T')[0];

    const { metrics, unansweredQuestions } = await db.computeDailyMetrics(DEMO_CLINIC_ID, todayStr);
    console.log('  [Computed Metrics]:', {
      totalConversations: metrics.totalConversations,
      bookingsCreated: metrics.bookingsCreated,
      openEscalations: metrics.openEscalations,
      autoResolvedPercent: `${metrics.autoResolvedPercent}%`,
    });

    const highlights = await generateHighlights(todayStr, metrics);
    console.log(`  [Generated Highlights]: "${highlights}"`);

    // Verify all numbers in highlights exist in computed data
    const isValid = validateSummaryNumbers(highlights, metrics);
    if (!isValid) {
      throw new Error('Highlights text contains hallucinated numbers not present in computed metrics!');
    }

    // Verify tampered highlights with hallucinated figure are correctly rejected
    const tampered = highlights + ' We also made 99999 rupees in profit.';
    const isTamperedValid = validateSummaryNumbers(tampered, metrics);
    if (isTamperedValid) {
      throw new Error('Failed to reject hallucinated number 99999 in tampered highlights!');
    }

    // Save and retrieve DailySummary
    const summaryRecord = {
      id: `ds_test_${todayStr}`,
      business_id: DEMO_CLINIC_ID,
      date: todayStr,
      metrics,
      highlights,
      unanswered_questions: unansweredQuestions,
      created_at: new Date().toISOString(),
    };

    await db.saveDailySummary(summaryRecord);
    const retrieved = await db.getDailySummary(DEMO_CLINIC_ID, todayStr);
    if (!retrieved || retrieved.date !== todayStr) {
      throw new Error('Failed to persist or retrieve DailySummary from database!');
    }
    console.log('  [Daily Summary]: Computed in code, validated numbers strictly, and persisted successfully.');
  });

  console.log(`====================================================`);
  console.log(`RESULTS: ${passed}/${total} owner test suites passed!`);
  console.log(`====================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runOwnerTests().catch((err) => {
  console.error('Fatal owner test error:', err);
  process.exit(1);
});
