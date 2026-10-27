// scripts/test-closed-hours.ts
import { processMessage } from '../src/lib/orchestrator';
import { DEMO_CLINIC_ID } from '../src/lib/kb/demo-clinic';

async function main() {
  console.log('====================================================');
  console.log('⏰ Testing Inquiries During Break & Closed Hours');
  console.log('====================================================\n');

  const testCases = [
    {
      label: 'English: Afternoon OPD Break (2 PM tomorrow)',
      text: 'I need an appointment at 2 PM tomorrow',
      expectedClosedSnippet: 'closed at 2:00 PM',
      expectedBreakSnippet: 'break',
    },
    {
      label: 'Hinglish: Afternoon OPD Break (dopehar 2 baje kal)',
      text: 'kal dopehar 2 baje doctor se milna hai',
      expectedClosedSnippet: 'band rehta hai',
      expectedBreakSnippet: 'break',
    },
    {
      label: 'Kannada/Kanglish: Afternoon OPD Break (madhyahna 2 gante)',
      text: 'naale madhyahna 2 gante doctor appointment beku',
      expectedClosedSnippet: 'ಮುಚ್ಚಿರುತ್ತದೆ',
      expectedBreakSnippet: 'ವಿರಾಮ',
    },
    {
      label: 'English: Early Morning before opening (7 AM tomorrow)',
      text: 'Can I get an appointment at 7 AM tomorrow morning?',
      expectedClosedSnippet: 'closed at 7:00 AM',
      expectedBreakSnippet: '9:00 AM',
    },
    {
      label: 'English: Night after closing (9 PM tomorrow)',
      text: 'Can I consult the doctor at 9 PM tomorrow night?',
      expectedClosedSnippet: 'closed at 9:00 PM',
      expectedBreakSnippet: '8:00 PM',
    },
  ];

  for (const tc of testCases) {
    console.log(`--- ${tc.label} ---`);
    console.log(`Query: "${tc.text}"`);
    const res = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: `conv_closed_${Date.now()}`,
      text: tc.text,
    });

    console.log(`  Decision: ${res.decision}`);
    console.log(`  Reply: ${res.text}`);
    console.log(`  Quick Replies: ${res.quickReplies?.join(' | ')}\n`);

    if (res.decision !== 'act') {
      throw new Error(`Expected decision 'act', got '${res.decision}'`);
    }

    if (!res.text.includes(tc.expectedClosedSnippet) && !res.text.includes(tc.expectedBreakSnippet)) {
      throw new Error(`Expected reply to mention closed or break times!`);
    }
    console.log('  ✅ PASSED\n');
  }

  console.log('🎉 ALL CLOSED HOURS & BREAK TESTS PASSED CLEANLY!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
