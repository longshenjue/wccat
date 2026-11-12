import "./load-env";
import { generateDailyReport } from "../src/lib/daily-report";
import { refreshSnapshot } from "../src/lib/store";
import { msUntilNextChinaTime, msUntilNextHour } from "../src/lib/date";

const dailyReportHour = 0;
const dailyReportMinute = 10;

async function runOnce() {
  const snapshot = await refreshSnapshot();
  console.log(
    `[WcCAT] ${new Date().toISOString()} stored ${snapshot.rawItems.length} raw items and ${snapshot.topics.length} topics for ${snapshot.date}.`
  );
}

async function main() {
  await runOnce();
  scheduleNextHour();
  scheduleDailyReport();
}

function scheduleNextHour() {
  const delay = msUntilNextHour();
  console.log(`[WcCAT] next hourly refresh in ${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      await runOnce();
    } catch (error) {
      console.error("[WcCAT] hourly refresh failed", error);
    } finally {
      scheduleNextHour();
    }
  }, delay);
}

function scheduleDailyReport() {
  const delay = msUntilNextChinaTime(dailyReportHour, dailyReportMinute);
  console.log(`[WcCAT] next daily report at 00:10 China time in ${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const report = await generateDailyReport();
      console.log(
        `[WcCAT] generated scheduled daily report ${report.reportDate}: ${report.topics.length} topics, window ${report.windowStart} -> ${report.windowEnd}.`
      );
    } catch (error) {
      console.error("[WcCAT] scheduled daily report failed", error);
    } finally {
      scheduleDailyReport();
    }
  }, delay);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
