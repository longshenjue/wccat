import "./load-env";
import { generateDailyReport } from "../src/lib/daily-report";

async function main() {
  const report = await generateDailyReport();
  console.log(
    `[WcCAT] generated daily report ${report.reportDate}: ${report.topics.length} topics, window ${report.windowStart} -> ${report.windowEnd}, model ${report.model}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
