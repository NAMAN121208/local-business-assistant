// scripts/test-cancellation.ts
import { processMessage } from '../src/lib/orchestrator';
import { db } from '../src/lib/db';
import { confirmBooking } from '../src/lib/booking';
import { DEMO_CLINIC_ID } from '../src/lib/kb/demo-clinic';

async function runCancellationTestSuite() {
  console.log('====================================================');
  console.log('🧪 Testing Customer Cancellation & Ownership Security');
  console.log('====================================================\n');

  // Setup: Create a real booking for Customer A (Phone: +91 98111 22233)
  const custA = await db.upsertCustomer({
    id: 'cust_cancel_test_a',
    business_id: DEMO_CLINIC_ID,
    name: 'Aarav Patel',
    contact: '+91 98111 22233',
  });

  const testBooking = await confirmBooking({
    businessId: DEMO_CLINIC_ID,
    customerId: custA.id,
    service: 'General Physician Consultation',
    startTimeIso: '2026-11-15T11:00:00.000Z',
    endTimeIso: '2026-11-15T11:30:00.000Z',
  });

  console.log(`[SETUP] Created active booking ID: ${testBooking.id} for Aarav Patel (+91 98111 22233)\n`);

  // Test 1: Malicious / Cross-customer attempt to cancel someone else's booking
  console.log('--- TEST 1: Cross-Customer Attack (Mismatched Phone Number) ---');
  const res1 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: `conv_cancel_attack_${Date.now()}`,
    text: `Please cancel appointment ${testBooking.id} 98999 88888`, // attacker's phone
  });

  console.log(`  Decision: ${res1.decision}`);
  console.log(`  Reply: ${res1.text}\n`);

  const bookingAfterAttack = await db.getBooking(testBooking.id);
  const attackBlocked =
    res1.text.includes('Security verification failed') &&
    bookingAfterAttack?.status === 'confirmed';

  if (!attackBlocked) {
    throw new Error('TEST 1 FAILED: Mismatched phone was allowed to cancel or modify another customer\'s booking!');
  }
  console.log('  ✅ TEST 1 PASSED: Cross-customer cancellation blocked with security notice.\n');

  // Test 2: Legitimate customer cancellation with matching phone number
  console.log('--- TEST 2: Legitimate Cancellation (Matching Phone Number) ---');
  const res2 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: `conv_cancel_legit_${Date.now()}`,
    text: `Cancel booking ${testBooking.id} 9811122233`, // matching phone
  });

  console.log(`  Decision: ${res2.decision}`);
  console.log(`  Reply: ${res2.text}\n`);

  const bookingAfterCancel = await db.getBooking(testBooking.id);
  const cancelSuccess =
    res2.text.includes('successfully cancelled') &&
    bookingAfterCancel?.status === 'cancelled';

  if (!cancelSuccess) {
    throw new Error('TEST 2 FAILED: Verified owner was unable to cancel their own booking!');
  }
  console.log('  ✅ TEST 2 PASSED: Legitimate owner cancelled booking and released slot.\n');

  // Test 3: Vague cancellation request without credentials (escalates to owner)
  console.log('--- TEST 3: Unauthenticated Cancellation (No ID or Phone) ---');
  const convId3 = `conv_cancel_vague_${Date.now()}`;
  const res3 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: convId3,
    text: 'Please cancel my appointment scheduled for tomorrow',
  });

  console.log(`  Decision: ${res3.decision}`);
  console.log(`  Reply: ${res3.text}\n`);

  const escalations = await db.getEscalations(convId3);
  const hasEsc = escalations.length > 0;
  console.log(`  Escalation created for clinic staff: ${hasEsc ? 'YES' : 'NO'}`);

  if (!res3.text.includes('Booking ID') || !hasEsc) {
    throw new Error('TEST 3 FAILED: Vague cancellation request did not provide policy instructions or escalate to staff!');
  }
  console.log('  ✅ TEST 3 PASSED: Patient given secure cancellation instructions and owner alerted.\n');

  console.log('====================================================');
  console.log('🎉 ALL 3 CANCELLATION TESTS PASSED CLEANLY!');
  console.log('====================================================');
}

runCancellationTestSuite().catch((err) => {
  console.error('Cancellation test failed:', err);
  process.exit(1);
});
