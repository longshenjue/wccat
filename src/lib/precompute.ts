import {
  readRecentTopicAnalysisBeforeDate,
  readTopicAnalysesForDate,
  saveAiAnalysisLogToDb,
  saveTopicAnalysisToDb,
  writeGeneration
} from "./db";
import { fetchArticleContexts } from "./fulltext";
import { analyzeTopicWithDeepSeek, buildFallbackTopicAnalysis } from "./topic-analysis";
import type { DailySnapshot } from "./types";
import {MaintenanceError} from "./maintenance";

const defaultLimit = 1;

export async function precomputeTopicAnalyses(snapshot: DailySnapshot, top?: number) {
  const generation = writeGeneration();
  const configuredLimit = Number(process.env.WCCAT_ANALYZE_TOPICS ?? defaultLimit);
  const limit = Number.isFinite(top) && top ? top : configuredLimit;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : defaultLimit;
  const existing = readTopicAnalysesForDate(snapshot.date);
  const canUpgradeLocalFallbacks = Boolean(process.env.DEEPSEEK_API_KEY);
  const candidates = snapshot.topics.slice(0, safeLimit);
  const topics = candidates.filter((topic) => {
    const analysis = existing[topic.id];
    if (!analysis) {
      return true;
    }

    return canUpgradeLocalFallbacks && analysis.model === "local-rules";
  });

  const skipped = candidates.length - topics.length;
  console.log(
    `[WcCAT][AI] precompute top ${safeLimit}: ${topics.length} pending, ${skipped} skipped${
      canUpgradeLocalFallbacks ? ", local fallback upgrade enabled" : ""
    }`
  );

  for (const topic of topics) {
    const existingAnalysis = existing[topic.id];
    if (existingAnalysis?.model === "local-rules") {
      console.log(`[WcCAT][AI] upgrading #${topic.rank} ${topic.title} from local-rules`);
    }

    try {
      const articleContexts = await fetchArticleContexts(topic.occurrences);
      const previous = readRecentTopicAnalysisBeforeDate(snapshot.date, topic.id);
      const previousAnalysis = previous?.analysis.model === "local-rules" ? undefined : previous?.analysis;
      if (previous && previousAnalysis) {
        console.log(`[WcCAT][AI] anchoring #${topic.rank} to ${previous.snapshotDate}`);
      }
      const analysis = await analyzeTopicWithDeepSeek(topic, articleContexts, previousAnalysis, (trace) => {
        saveAiAnalysisLogToDb(snapshot.date, topic.id, trace, generation);
        console.log(
          `[WcCAT][AI] #${topic.rank} ${trace.provider}/${trace.model} ${trace.status} ${trace.durationMs}ms fallback=${trace.usedFallback}`
        );
        if (trace.error) {
          console.warn(`[WcCAT][AI] #${topic.rank} ${trace.error}`);
        }
      });
      saveTopicAnalysisToDb(snapshot.date, topic.id, analysis, generation);
      if (analysis.model === "local-rules") {
        console.warn(`[WcCAT] AI analysis unavailable for #${topic.rank} ${topic.title}; saved local-rules fallback. Retry with npm run analyze -- top=${safeLimit}`);
      } else {
        console.log(`[WcCAT] analyzed #${topic.rank} ${topic.title} via ${analysis.model}`);
      }
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      saveTopicAnalysisToDb(snapshot.date, topic.id, buildFallbackTopicAnalysis(topic), generation);
      console.warn(`[WcCAT] analysis fallback for ${topic.title}`, error);
    }
  }
}
