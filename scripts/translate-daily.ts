import './load-env';
import { backfillDailyShareEnglish } from '../src/lib/daily-share-backfill';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !/^\d{4}-\d{2}-\d{2}$/.test(args[0]))) {
    throw new Error('Usage: npm run daily:translate -- [YYYY-MM-DD]');
  }
  const result = await backfillDailyShareEnglish(args[0]);
  console.log(`[WcCAT] English share ready for ${result.reportDate} (${result.status}); Chinese report unchanged.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
