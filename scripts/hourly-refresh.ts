import "./load-env";
import { generateDailyReport } from "../src/lib/daily-report";
import { refreshSnapshot } from "../src/lib/store";
import { msUntilNextChinaTime, msUntilNextRefresh } from "../src/lib/date";

const dailyReportHour = 2;
const dailyReportMinute = 0;

async function runOnce() {
  const snapshot = await refreshSnapshot();
  console.log(
    `[WcCAT] ${new Date().toISOString()} stored ${snapshot.rawItems.length} raw items and ${snapshot.topics.length} topics for ${snapshot.date}.`
  );
}

async function main() {
  try {
    await runOnce();
  } catch (error) {
    console.error("[WcCAT] initial refresh failed; 4-hour retries remain scheduled", error);
  }
  scheduleNextRefresh();
  scheduleDailyReport();
}

function scheduleNextRefresh() {
  const delay = msUntilNextRefresh();
  console.log(`[WcCAT] next 4-hour refresh in ${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      await runOnce();
    } catch (error) {
      console.error("[WcCAT] 4-hour refresh failed", error);
    } finally {
      scheduleNextRefresh();
    }
  }, delay);
}

function scheduleDailyReport() {
  const delay = msUntilNextChinaTime(dailyReportHour, dailyReportMinute);
  console.log(`[WcCAT] next daily report at 02:00 China time in ${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const report = await generateDailyReport();
      console.log(
        `[WcCAT] generated scheduled daily report ${report.reportDate}: ${report.topics.length} topics, window ${report.windowStart} -> ${report.windowEnd}, English share ${report.shareEnglish ? "ready" : "unavailable (retry: npm run daily:translate)"}.`
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
