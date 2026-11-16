import "./load-env";
import { generateDailyReport } from "../src/lib/daily-report";

async function main() {
  const report = await generateDailyReport();
  console.log(
    `[WcCAT] generated daily report ${report.reportDate}: ${report.topics.length} topics, window ${report.windowStart} -> ${report.windowEnd}, model ${report.model}, English share ${report.shareEnglish ? "ready" : "unavailable (retry: npm run daily:translate)"}, ShareEn ${report.shareEn ? "ready" : "unavailable (retry: npm run daily:shareen)"}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
