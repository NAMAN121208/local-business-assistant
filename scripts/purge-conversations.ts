// scripts/purge-conversations.ts
import { db } from '../src/lib/db';
import { DEMO_CLINIC_ID } from '../src/lib/kb/demo-clinic';

async function main() {
  const args = process.argv.slice(2);
  const olderThanDaysArg = args.find((a) => a.startsWith('--days='));
  const days = olderThanDaysArg ? parseInt(olderThanDaysArg.split('=')[1], 10) : 0;

  console.log(`[PURGE] Starting conversation purge for business: ${DEMO_CLINIC_ID}`);
  if (days > 0) {
    console.log(`[PURGE] Retention filter: Purging records older than ${days} days.`);
  } else {
    console.log(`[PURGE] Filter: Purging ALL conversations.`);
  }

  const result = await db.purgeConversations(DEMO_CLINIC_ID, days);
  console.log(`[PURGE] Completed successfully! ${result.deletedCount} conversation(s) and associated messages purged.`);
}

main().catch((err) => {
  console.error('[PURGE ERROR]', err);
  process.exit(1);
});
