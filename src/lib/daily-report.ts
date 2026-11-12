import { getChinaDate, getChinaSnapshotId } from "./date";
import {
  readDailyReportFromDb,
  readLatestDailyReportFromDb,
  readRecentSnapshotsFromDb,
  readSnapshotFromDb,
  readTopicAnalysesForDate,
  saveDailyReportToDb,
  saveDailyShareEnglishToDb
} from "./db";
import { normalizeTitle } from "./normalize";
import { selectDailySnapshots } from "./daily-window";
import { translateDailyShare } from "./daily-share-translation";
import type { DailyShareCopy } from "./daily-share-copy";
import { sentimentLabel } from "./sentiment";
import { analyzeTopicWithDeepSeek, type TopicAnalysis } from "./topic-analysis";
import { fetchArticleContexts } from "./fulltext";
import type { DailySnapshot, Sentiment, TopicGroup, TopicOccurrence } from "./types";

export type DailyReportTopic = {
  id: string;
  rank: number;
  title: string;
  dailyScore: number;
  peakRank: number;
  peakHeatScore: number;
  activeHours: number;
  sources: string[];
  categories: string[];
  sentiment: Sentiment;
  signal: "dominant" | "rising" | "long-tail";
  oneLine: string;
  whyItMatters: string;
  cover?: string;
  coverSourceId?: string;
  aiAnalysis?: TopicAnalysis;
  analysisSnapshotDate?: string;
  analysisTopicId?: string;
  links: Array<{
    sourceId: string;
    sourceName: string;
    title: string;
    url: string;
  }>;
};

export type WccatDailyReport = {
  reportDate: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  headline: string;
  overview: string;
  topics: DailyReportTopic[];
  wechatDraft: string;
  videoScript: string;
  model: string;
  shareEnglish?: DailyShareCopy;
};

type TopicBucket = {
  key: string;
  title: string;
  sentiment: Sentiment;
  topics: TopicGroup[];
  occurrences: TopicOccurrence[];
  snapshotDates: Set<string>;
  sources: Set<string>;
  categories: Set<string>;
  totalHeat: number;
  peakHeatScore: number;
  peakRank: number;
  peakSnapshotDate?: string;
  peakTopicId?: string;
};

type GeneratedDrafts = Pick<WccatDailyReport, "headline" | "overview" | "wechatDraft" | "videoScript" | "model">;

export async function generateDailyReport(inputDate = new Date()) {
  const reportDate = getChinaDate(inputDate);
  const beforeOrAt = getChinaSnapshotId(inputDate);
  const snapshots = selectDailySnapshots(readRecentSnapshotsFromDb(24, beforeOrAt), inputDate);
  const topics = buildDailyTopTopics(snapshots).slice(0, 10);
  const top = topics[0];
  if (top && (!top.aiAnalysis || top.aiAnalysis.model === "local-rules") && top.analysisSnapshotDate) {
    const snapshot = readSnapshotFromDb(top.analysisSnapshotDate);
    const original = snapshot?.topics.find((topic) => topic.id === top.analysisTopicId);
    if (original) {
      top.aiAnalysis = await analyzeTopicWithDeepSeek(original, await fetchArticleContexts(original.occurrences));
    }
  }
  const drafts = await generateDrafts(reportDate, snapshots, topics);
  const report: WccatDailyReport = {
    reportDate,
    generatedAt: new Date().toISOString(),
    windowStart: snapshots[0]?.date ?? beforeOrAt,
    windowEnd: snapshots.at(-1)?.date ?? beforeOrAt,
    topics,
    ...drafts
  };

  saveDailyReportToDb(report);
  report.shareEnglish = await translateDailyShare(report);
  if (report.shareEnglish) saveDailyShareEnglishToDb(report);
  return report;
}

export function getDailyReport(reportDate?: string) {
  if (reportDate) {
    return readDailyReportFromDb(reportDate);
  }

  return readLatestDailyReportFromDb();
}

function buildDailyTopTopics(snapshots: DailySnapshot[]) {
  const buckets = new Map<string, TopicBucket>();

  for (const snapshot of snapshots) {
    for (const topic of snapshot.topics.slice(0, 30)) {
      const key = normalizeTitle(topic.normalizedTitle || topic.title);
      const bucket =
        buckets.get(key) ??
        ({
          key,
          title: topic.title,
          sentiment: topic.sentiment,
          topics: [],
          occurrences: [],
          snapshotDates: new Set<string>(),
          sources: new Set<string>(),
          categories: new Set<string>(),
          totalHeat: 0,
          peakHeatScore: 0,
          peakRank: Number.POSITIVE_INFINITY,
          peakSnapshotDate: undefined,
          peakTopicId: undefined
        } satisfies TopicBucket);

      bucket.topics.push(topic);
      bucket.occurrences.push(...topic.occurrences);
      bucket.snapshotDates.add(snapshot.date);
      topic.sources.forEach((source) => bucket.sources.add(source));
      topic.categories.forEach((category) => bucket.categories.add(category));
      bucket.totalHeat += topic.heatScore * recencyMultiplier(snapshot.date, snapshots);
      bucket.peakHeatScore = Math.max(bucket.peakHeatScore, topic.heatScore);
      bucket.peakRank = Math.min(bucket.peakRank, topic.rank);
      if (topic.heatScore >= bucket.peakHeatScore) {
        bucket.title = topic.title;
        bucket.sentiment = topic.sentiment;
        bucket.peakSnapshotDate = snapshot.date;
        bucket.peakTopicId = topic.id;
      }

      buckets.set(key, bucket);
    }
  }

  const analysisCache = new Map<string, ReturnType<typeof readTopicAnalysesForDate>>();

  return [...buckets.values()]
    .map(toDailyReportTopic)
    .map((topic) => attachTopicAnalysis(topic, analysisCache))
    .sort((left, right) => right.dailyScore - left.dailyScore)
    .map((topic, index) => ({ ...topic, rank: index + 1 }));
}

function toDailyReportTopic(bucket: TopicBucket): DailyReportTopic {
  const sourceDiversity = Math.min(bucket.sources.size, 6) * 120;
  const persistence = bucket.snapshotDates.size * 60;
  const peakBonus = Math.max(0, 11 - bucket.peakRank) * 80;
  const dailyScore = Math.round(bucket.totalHeat / 12 + sourceDiversity + persistence + peakBonus);
  const uniqueLinks = uniqueOccurrences(bucket.occurrences).slice(0, 6);
  const firstTopic = bucket.topics[0];
  const coverOccurrence = bucket.occurrences.find((item) => item.cover);

  return {
    id: bucket.key,
    rank: 0,
    title: bucket.title,
    dailyScore,
    peakRank: Number.isFinite(bucket.peakRank) ? bucket.peakRank : 0,
    peakHeatScore: bucket.peakHeatScore,
    activeHours: bucket.snapshotDates.size,
    sources: [...bucket.sources],
    categories: [...bucket.categories],
    sentiment: bucket.sentiment,
    signal: inferDailySignal(bucket),
    oneLine: firstTopic?.summary.oneLine ?? `${bucket.title} 是过去 24 小时的高频中文互联网话题。`,
    whyItMatters:
      firstTopic?.summary.whyItMatters ??
      "它在过去 24 小时持续出现在榜单中，适合作为日更内容的主线素材。",
    cover: coverOccurrence?.cover,
    coverSourceId: coverOccurrence?.sourceId,
    analysisSnapshotDate: bucket.peakSnapshotDate,
    analysisTopicId: bucket.peakTopicId,
    links: uniqueLinks.map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      title: item.title,
      url: item.url
    }))
  };
}

function attachTopicAnalysis(
  topic: DailyReportTopic,
  analysisCache: Map<string, ReturnType<typeof readTopicAnalysesForDate>>
): DailyReportTopic {
  if (!topic.analysisSnapshotDate || !topic.analysisTopicId) {
    return topic;
  }

  const analyses =
    analysisCache.get(topic.analysisSnapshotDate) ?? readTopicAnalysesForDate(topic.analysisSnapshotDate);
  analysisCache.set(topic.analysisSnapshotDate, analyses);

  const aiAnalysis = analyses[topic.analysisTopicId];
  return aiAnalysis ? { ...topic, aiAnalysis } : topic;
}

function recencyMultiplier(snapshotDate: string, snapshots: DailySnapshot[]) {
  const index = snapshots.findIndex((snapshot) => snapshot.date === snapshotDate);
  if (index < 0 || snapshots.length <= 1) {
    return 1;
  }

  return 0.85 + (index / (snapshots.length - 1)) * 0.3;
}

async function generateDrafts(
  reportDate: string,
  snapshots: DailySnapshot[],
  topics: DailyReportTopic[]
): Promise<GeneratedDrafts> {
  const fallback = buildFallbackDrafts(reportDate, snapshots, topics);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";

  if (!apiKey || topics.length === 0) {
    return fallback;
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.42,
        messages: [
          {
            role: "system",
            content: buildDailySystemPrompt()
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                reportDate,
                window: {
                  start: snapshots[0]?.date,
                  end: snapshots.at(-1)?.date,
                  snapshots: snapshots.length
                },
                topics: topics.map((topic) => ({
                  rank: topic.rank,
                  title: topic.title,
                  dailyScore: topic.dailyScore,
                  activeHours: topic.activeHours,
                  peakRank: topic.peakRank,
                  sources: topic.sources,
                  sentiment: sentimentLabel(topic.sentiment),
                  oneLine: topic.oneLine,
                  whyItMatters: topic.whyItMatters
                }))
              },
              null,
              2
            )
          }
        ]
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }

    const parsed = JSON.parse(content) as Partial<GeneratedDrafts>;
    return {
      headline: textOr(parsed.headline, fallback.headline),
      overview: textOr(parsed.overview, fallback.overview),
      wechatDraft: textOr(parsed.wechatDraft, fallback.wechatDraft),
      videoScript: textOr(parsed.videoScript, fallback.videoScript),
      model
    };
  } catch {
    return fallback;
  }
}

function buildDailySystemPrompt() {
  return `你是 WcCAT 的日更内容主编。请基于过去 24 小时中文互联网热点，生成可直接用于公众号和短视频的中文稿件。

必须严格输出 JSON，不要输出 Markdown。字段如下：
{
  "headline": "24字以内的日报标题",
  "overview": "120字以内的今日总览，解释注意力、情绪、冲突和共识",
  "wechatDraft": "公众号文字稿，650-900字，包含开头、Top10简述、观察总结，不要编造事实",
  "videoScript": "短视频口播稿，约90-150秒，包含开场钩子、10个话题快节奏串联、结尾观点"
}

规则：
- 这是面向外国人理解中文互联网的内容，但第一版用中文写。
- 不要写成热搜搬运，要解释“今天中文互联网在关心什么”。
- 没有证据的事实不要补充；可以使用“从榜单信号看”。
- 公众号稿要适合截图/排版，视频稿要适合抖音和 B 站口播。`;
}

function buildFallbackDrafts(
  reportDate: string,
  snapshots: DailySnapshot[],
  topics: DailyReportTopic[]
): GeneratedDrafts {
  const headline = topics[0] ? `WcCAT ${reportDate} 中文互联网日报` : `WcCAT ${reportDate} 暂无足够热点`;
  const topicLines = topics
    .map(
      (topic) =>
        `${topic.rank}. ${topic.title}：${topic.oneLine} 来源覆盖 ${topic.sources.join("、")}，持续 ${topic.activeHours} 小时。`
    )
    .join("\n");
  const overview =
    topics.length > 0
      ? `过去 24 小时，中文互联网的注意力集中在「${topics[0].title}」等话题。榜单综合了 ${snapshots.length} 个小时快照，优先考虑跨平台共振、持续时间和峰值排名。`
      : "过去 24 小时的快照数量不足，暂时无法生成可靠日报。";

  return {
    headline,
    overview,
    wechatDraft: `${headline}\n\n${overview}\n\nTop 10 热点：\n${topicLines}\n\nWcCAT 的观察重点不是单个平台的热搜，而是这些话题如何共同构成今天中文互联网的注意力结构：哪些是公共事件，哪些是娱乐消费，哪些代表求证，哪些代表情绪扩散。`,
    videoScript: `今天的 WcCAT，带你用 90 秒看懂过去 24 小时中文互联网在关心什么。\n\n${topicLines}\n\n总结一下，今天的核心不是单个热搜，而是这些话题背后的注意力、情绪和平台差异。这里是 WcCAT，What Chinese Care About Today。`,
    model: "local-template"
  };
}

function inferDailySignal(bucket: TopicBucket): DailyReportTopic["signal"] {
  if (bucket.snapshotDates.size >= 8 && bucket.peakRank <= 5) {
    return "dominant";
  }
  if (bucket.topics.at(-1)?.signal === "rising" || bucket.topics.at(-1)?.signal === "new") {
    return "rising";
  }

  return "long-tail";
}

function uniqueOccurrences(occurrences: TopicOccurrence[]) {
  const seen = new Set<string>();

  return occurrences.filter((item) => {
    const key = `${item.sourceId}-${item.url || item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function textOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
