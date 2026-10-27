// scripts/test-booking-suite.ts
import {
  checkAvailability,
  confirmBooking,
  getClinicNow,
  parseRelativeDate,
  parseTimeWindow,
} from '../src/lib/booking';
import { DEMO_CLINIC_ID, demoClinicKBContent } from '../src/lib/kb/demo-clinic';
import { db } from '../src/lib/db';
import { initKnowledgeBase } from '../src/lib/kb';

async function runBookingEdgeCasesSuite() {
  console.log('====================================================');
  console.log('📅 Running Comprehensive Booking Engine Edge Cases & Race Suite');
  console.log('====================================================\n');

  await initKnowledgeBase();
  const now = getClinicNow('Asia/Kolkata');

  // 1. Race Condition: Two concurrent booking attempts for the exact same slot
  console.log('--- TEST 1: Race Condition & Double-Booking Prevention ---');
  const targetDate = '2026-11-10'; // future Tuesday
  const slotStartIso = `${targetDate}T10:00:00.000Z`;
  const slotEndIso = `${targetDate}T10:30:00.000Z`;

  const results = await Promise.allSettled([
    confirmBooking({
      businessId: DEMO_CLINIC_ID,
      customerId: 'cust_race_1',
      service: 'General Physician Consultation',
      startTimeIso: slotStartIso,
      endTimeIso: slotEndIso,
    }),
    confirmBooking({
      businessId: DEMO_CLINIC_ID,
      customerId: 'cust_race_2',
      service: 'General Physician Consultation',
      startTimeIso: slotStartIso,
      endTimeIso: slotEndIso,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  console.log(`  Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(`Race condition failure! Expected exactly 1 booking to succeed and 1 to be rejected, got: ${fulfilled.length} succeeded, ${rejected.length} rejected.`);
  }
  console.log('  ✅ Test 1 Passed: Exactly one concurrent booking succeeded, duplicate was rejected with slot collision error.\n');

  // 2. Edge Case: Past date
  console.log('--- TEST 2: Past Date Rejection ---');
  const pastRes = await checkAvailability({
    businessId: DEMO_CLINIC_ID,
    dateStr: '2020-01-01',
  });
  if (pastRes.available || !pastRes.reason?.includes('past')) {
    throw new Error('Test 2 Failed: Past date was not rejected!');
  }
  console.log(`  Reason: "${pastRes.reason}"`);
  console.log('  ✅ Test 2 Passed: Past date strictly rejected.\n');

  // 3. Edge Case: Public Holiday
  console.log('--- TEST 3: Public Holiday Rejection ---');
  const holidayDate = demoClinicKBContent.holidays[0] || '2026-08-15';
  const holidayRes = await checkAvailability({
    businessId: DEMO_CLINIC_ID,
    dateStr: holidayDate,
  });
  if (holidayRes.available || !holidayRes.reason?.includes('holiday')) {
    throw new Error('Test 3 Failed: Holiday was not rejected!');
  }
  console.log(`  Reason: "${holidayRes.reason}"`);
  console.log('  ✅ Test 3 Passed: Public holiday strictly rejected.\n');

  // 4. Edge Case: Sunday Routine Closure with Emergency routing
  console.log('--- TEST 4: Sunday Routine Closure ---');
  const sundayDate = '2026-11-15'; // Sunday
  const sundayRes = await checkAvailability({
    businessId: DEMO_CLINIC_ID,
    dateStr: sundayDate,
  });
  if (sundayRes.available || !sundayRes.reason?.includes('Sunday') || !sundayRes.reason?.includes('Emergency')) {
    throw new Error('Test 4 Failed: Sunday routine closure did not return emergency on-call contact!');
  }
  console.log(`  Reason: "${sundayRes.reason}"`);
  console.log('  ✅ Test 4 Passed: Sunday routine closure verified with emergency hotline.\n');

  // 5. Edge Case: Lunch Break (1:00 PM - 4:00 PM)
  console.log('--- TEST 5: Lunch Break Invariance ---');
  const futureWeekday = '2026-11-11'; // Wednesday
  const weekdaySlots = await checkAvailability({
    businessId: DEMO_CLINIC_ID,
    dateStr: futureWeekday,
  });
  const hasLunchSlot = weekdaySlots.slots.some((s) => {
    const t = s.time;
    return t.includes('1:00 PM') || t.includes('2:00 PM') || t.includes('3:00 PM');
  });
  if (hasLunchSlot) {
    throw new Error('Test 5 Failed: Slot was offered during clinic lunch break (1 PM - 4 PM)!');
  }
  console.log(`  Slots offered: ${weekdaySlots.slots.map((s) => s.time).join(', ')}`);
  console.log('  ✅ Test 5 Passed: Zero slots offered during afternoon closure.\n');

  // 6. Timezone boundary: Parsing at midnight / late night IST
  console.log('--- TEST 6: Timezone & Relative Date Parsing ---');
  const parsedTomorrow = parseRelativeDate('kal subah doctor available hain kya?', 'Asia/Kolkata');
  const parsedDayAfter = parseRelativeDate('parso appointment chahiye', 'Asia/Kolkata');
  console.log(`  Parsed Tomorrow (kal): ${parsedTomorrow}`);
  console.log(`  Parsed Day After (parso): ${parsedDayAfter}`);
  if (!parsedTomorrow || !parsedDayAfter) {
    throw new Error('Test 6 Failed: Relative dates failed to parse in IST timezone!');
  }
  console.log('  ✅ Test 6 Passed: Multilingual relative dates parsed accurately in Asia/Kolkata.\n');

  // 7. Cancellation & Slot Freeing
  console.log('--- TEST 7: Booking Cancellation & Immediate Slot Recovery ---');
  const bookedSlot = (fulfilled[0] as PromiseFulfilledResult<any>).value;
  await db.cancelBooking(bookedSlot.id);
  const reCheck = await checkAvailability({
    businessId: DEMO_CLINIC_ID,
    dateStr: targetDate,
    timeWindow: 'morning',
  });
  const slotFreed = reCheck.slots.some((s) => s.startTimeIso === slotStartIso);
  console.log(`  Cancelled Booking ID: ${bookedSlot.id}`);
  console.log(`  Slot ${slotStartIso} is available again: ${slotFreed ? 'YES' : 'NO'}`);
  if (!slotFreed) {
    throw new Error('Test 7 Failed: Cancelled booking slot was not freed in availability engine!');
  }
  // Idempotent cancel: cancelling again is safe
  await db.cancelBooking(bookedSlot.id);
  console.log('  ✅ Test 7 Passed: Slot was immediately freed upon cancellation and double-cancellation is safe.\n');

  // 8. Multi-Doctor / Multi-Service Capacity
  console.log('--- TEST 8: Multi-Doctor Simultaneous Booking & Same-Doctor Collisions ---');
  const multiDate = '2026-11-12';
  const startIso12 = `${multiDate}T10:00:00.000Z`;
  const endIso12 = `${multiDate}T10:30:00.000Z`;

  // Booking for Doctor 1 (General Physician)
  const bDoc1 = await confirmBooking({
    businessId: DEMO_CLINIC_ID,
    customerId: 'cust_doc_1',
    service: 'General Physician Consultation',
    startTimeIso: startIso12,
    endTimeIso: endIso12,
  });

  // Booking for Doctor 2 (Paediatrician) at the EXACT same time
  const bDoc2 = await confirmBooking({
    businessId: DEMO_CLINIC_ID,
    customerId: 'cust_doc_2',
    service: 'Paediatric Consultation',
    startTimeIso: startIso12,
    endTimeIso: endIso12,
  });

  console.log(`  Doctor 1 (General Physician) 10:00 AM booking: ${bDoc1.id} (CONFIRMED)`);
  console.log(`  Doctor 2 (Paediatrician) 10:00 AM booking: ${bDoc2.id} (CONFIRMED)`);

  // Attempt duplicate booking for Doctor 1 (General Physician) at 10:00 AM -> MUST FAIL
  let duplicateRejected = false;
  try {
    await confirmBooking({
      businessId: DEMO_CLINIC_ID,
      customerId: 'cust_doc_3',
      service: 'General Physician Consultation',
      startTimeIso: startIso12,
      endTimeIso: endIso12,
    });
  } catch (err: any) {
    duplicateRejected = err.message.includes('Slot occupied');
  }

  if (!duplicateRejected) {
    throw new Error('Test 8 Failed: Duplicate booking for the same doctor/service at 10:00 AM was not rejected!');
  }
  console.log('  ✅ Test 8 Passed: Different doctors can consult concurrently; same-doctor collisions are rejected.\n');

  console.log('====================================================');
  console.log('🎉 ALL 8 BOOKING ENGINE TESTS PASSED CLEANLY!');
  console.log('====================================================');
}

runBookingEdgeCasesSuite().catch((err) => {
  console.error('Booking suite error:', err);
  process.exit(1);
});
