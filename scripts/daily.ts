import "./load-env";
import { generateDailyReport } from "../src/lib/daily-report";

async function main() {
  const report = await generateDailyReport();
  console.log(
    `[WcCAT] generated daily report ${report.reportDate}: ${report.topics.length} topics, window ${report.windowStart} -> ${report.windowEnd}, model ${report.model}, English share ${report.shareEnglish ? "ready" : "unavailable (retry: npm run daily:translate)"}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
