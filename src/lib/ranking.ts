import { getSourceById } from "./sources";
import { normalizeTitle, titleSimilarity, topicIdFromTitle } from "./normalize";
import { inferSentiment } from "./sentiment";
import type { AttentionSignal, EngagementStats, RawHotItem, SourceCategory, TopicGroup, TopicOccurrence } from "./types";
import { summarizeTopic } from "./summary";

const MAX_RANK_SCORE = 100;
const SAME_SOURCE_DECAY = [1, 0.25, 0.1];
const MAX_ENGAGEMENT_BONUS = 72;

type SourceTier = "core_public" | "discussion" | "news" | "business_tech" | "vertical";

const sourceTiers: Record<string, SourceTier> = {
  weibo: "core_public",
  baidu: "core_public",
  douyin: "core_public",
  toutiao: "core_public",
  zhihu: "discussion",
  bilibili: "discussion",
  douban: "discussion",
  hupu: "vertical",
  tieba: "vertical",
  ngabbs: "vertical",
  thepaper: "news",
  "qq-news": "news",
  "sina-news": "news",
  "netease-news": "news",
  "36kr": "business_tech",
  ithome: "business_tech",
  huxiu: "business_tech",
  sspai: "business_tech"
};

const singleSourceCeilings: Record<SourceTier, number> = {
  core_public: 180,
  discussion: 150,
  news: 140,
  business_tech: 118,
  vertical: 112
};

const sourceStatBaselines: Record<
  string,
  {
    audience: number;
    reaction: number;
    discussion: number;
    trust: number;
  }
> = {
  weibo: { audience: 2_000_000, reaction: 80_000, discussion: 20_000, trust: 0.92 },
  baidu: { audience: 1_500_000, reaction: 40_000, discussion: 12_000, trust: 0.72 },
  zhihu: { audience: 800_000, reaction: 35_000, discussion: 8_000, trust: 0.95 },
  bilibili: { audience: 1_000_000, reaction: 90_000, discussion: 12_000, trust: 1.12 },
  douyin: { audience: 2_000_000, reaction: 160_000, discussion: 20_000, trust: 1.08 },
  toutiao: { audience: 800_000, reaction: 30_000, discussion: 8_000, trust: 0.84 },
  thepaper: { audience: 300_000, reaction: 12_000, discussion: 3_000, trust: 0.8 },
  "qq-news": { audience: 600_000, reaction: 20_000, discussion: 6_000, trust: 0.82 },
  "sina-news": { audience: 500_000, reaction: 18_000, discussion: 5_000, trust: 0.8 },
  "netease-news": { audience: 500_000, reaction: 18_000, discussion: 6_000, trust: 0.82 },
  douban: { audience: 120_000, reaction: 5_000, discussion: 1_500, trust: 0.9 },
  hupu: { audience: 180_000, reaction: 8_000, discussion: 2_500, trust: 0.9 },
  tieba: { audience: 250_000, reaction: 10_000, discussion: 4_000, trust: 0.9 },
  ngabbs: { audience: 120_000, reaction: 5_000, discussion: 2_000, trust: 0.88 },
  "36kr": { audience: 120_000, reaction: 4_000, discussion: 1_000, trust: 0.82 },
  ithome: { audience: 180_000, reaction: 8_000, discussion: 2_000, trust: 0.86 },
  huxiu: { audience: 90_000, reaction: 3_500, discussion: 900, trust: 0.82 },
  sspai: { audience: 50_000, reaction: 2_500, discussion: 500, trust: 0.84 },
  xiaohongshu: { audience: 600_000, reaction: 60_000, discussion: 8_000, trust: 1.0 }
};

export function buildTopicRanking(rawItems: RawHotItem[]): TopicGroup[] {
  const occurrences = rawItems.map(toOccurrence);
  const buckets: TopicOccurrence[][] = [];

  for (const occurrence of occurrences) {
    const bucket = buckets.find((existing) =>
      existing.some((candidate) => shouldMerge(candidate, occurrence))
    );

    if (bucket) {
      bucket.push(occurrence);
    } else {
      buckets.push([occurrence]);
    }
  }

  return buckets
    .map(toTopicGroup)
    .sort((left, right) => right.heatScore - left.heatScore)
    .map((topic, index) => ({ ...topic, rank: index + 1 }));
}

export function applyRankSignals(topics: TopicGroup[], previousTopics: TopicGroup[] = []) {
  if (previousTopics.length === 0) {
    return topics.map((topic) => ({ ...topic, signal: "new" as AttentionSignal }));
  }

  return topics.map((topic) => {
    const previous = findPreviousTopic(topic, previousTopics);
    if (!previous) {
      return { ...topic, signal: "new" as AttentionSignal };
    }

    const delta = previous.rank - topic.rank;
    if (delta >= 2) {
      return { ...topic, signal: "rising" as AttentionSignal };
    }
    if (delta <= -2) {
      return { ...topic, signal: "cooling" as AttentionSignal };
    }
    return { ...topic, signal: "steady" as AttentionSignal };
  });
}

function toOccurrence(item: RawHotItem): TopicOccurrence {
  const source = getSourceById(item.sourceId);
  const rankScore = Math.max(12, MAX_RANK_SCORE - (item.rank - 1) * 3);
  const heatBonus = item.heatValue ? Math.min(28, Math.log10(item.heatValue + 1) * 6) : 0;
  const engagementBonus = computeEngagementBonus(item);

  return {
    ...item,
    normalizedTitle: normalizeTitle(item.title),
    platformScore: (rankScore + heatBonus + engagementBonus) * (source?.weight ?? 1)
  };
}

function shouldMerge(left: TopicOccurrence, right: TopicOccurrence) {
  if (!left.normalizedTitle || !right.normalizedTitle) {
    return false;
  }

  if (left.normalizedTitle === right.normalizedTitle) {
    return true;
  }

  return titleSimilarity(left.title, right.title) >= 0.42;
}

function toTopicGroup(occurrences: TopicOccurrence[]): TopicGroup {
  const sorted = [...occurrences].sort((left, right) => right.platformScore - left.platformScore);
  const lead = sorted[0];
  const sources = unique(sorted.map((item) => item.sourceName));
  const sourceIds = unique(sorted.map((item) => item.sourceId));
  const sourceKinds = unique(sorted.map((item) => item.sourceKind));
  const categories = unique(sorted.map((item) => item.sourceCategory));
  const officialPublicResonance =
    sourceKinds.includes("official") && sourceKinds.some((kind) => kind !== "official");
  const baseScore = computeSourceContributions(sorted);
  const crossPlatformBonus = computeCrossPlatformBonus(sourceIds, categories);
  const categoryDiversityBonus = computeCategoryDiversityBonus(categories);
  const resonanceBonus = officialPublicResonance ? 24 : 0;
  const rawHeatScore = baseScore + crossPlatformBonus + categoryDiversityBonus + resonanceBonus;
  const heatScore = Math.round(applySingleSourceCeiling(rawHeatScore, sorted, sourceIds));

  return {
    id: topicIdFromTitle(lead.title),
    title: lead.title,
    normalizedTitle: lead.normalizedTitle,
    rank: 0,
    heatScore,
    sources,
    sourceKinds,
    categories,
    occurrences: sorted,
    signal: inferSignal(sorted),
    sentiment: inferSentiment(sorted.map((item) => item.title).join(" ")),
    officialPublicResonance,
    summary: summarizeTopic(lead.title, sorted)
  };
}

function inferSignal(occurrences: TopicOccurrence[]): AttentionSignal {
  if (occurrences.length >= 3) {
    return "rising";
  }

  if (occurrences.some((item) => item.rank <= 3)) {
    return "new";
  }

  if (occurrences.every((item) => item.rank > 20)) {
    return "cooling";
  }

  return "steady";
}

function findPreviousTopic(topic: TopicGroup, previousTopics: TopicGroup[]) {
  const byId = previousTopics.find((previous) => previous.id === topic.id);
  if (byId) {
    return byId;
  }

  const byNormalizedTitle = previousTopics.find(
    (previous) => previous.normalizedTitle && previous.normalizedTitle === topic.normalizedTitle
  );
  if (byNormalizedTitle) {
    return byNormalizedTitle;
  }

  return previousTopics.find((previous) => titleSimilarity(previous.title, topic.title) >= 0.55);
}

function computeSourceContributions(occurrences: TopicOccurrence[]) {
  const bySource = new Map<string, TopicOccurrence[]>();

  for (const occurrence of occurrences) {
    const sourceItems = bySource.get(occurrence.sourceId) ?? [];
    sourceItems.push(occurrence);
    bySource.set(occurrence.sourceId, sourceItems);
  }

  let total = 0;
  for (const sourceItems of bySource.values()) {
    const sortedItems = [...sourceItems].sort((left, right) => right.platformScore - left.platformScore);
    total += sortedItems.reduce((sourceTotal, item, index) => {
      const decay = SAME_SOURCE_DECAY[index] ?? 0;
      return sourceTotal + item.platformScore * decay;
    }, 0);
  }

  return total;
}

function computeCrossPlatformBonus(sourceIds: string[], categories: SourceCategory[]) {
  if (sourceIds.length <= 1) {
    return 0;
  }

  const tiers = unique(sourceIds.map(sourceTier));
  const base = Math.pow(sourceIds.length - 1, 1.35) * 24;
  const hasCorePublic = tiers.includes("core_public");
  const hasDiscussion = tiers.includes("discussion") || tiers.includes("vertical");
  const hasNews = tiers.includes("news");
  const coreNewsDiscussionBonus = hasCorePublic && hasNews && hasDiscussion ? 28 : 0;
  const coreWithAnyBonus = hasCorePublic && tiers.length >= 2 ? 18 : 0;
  const newsPublicBonus = hasNews && hasCorePublic ? 14 : 0;
  const multiCategoryBonus = categories.length >= 3 ? 12 : 0;

  return base + coreNewsDiscussionBonus + coreWithAnyBonus + newsPublicBonus + multiCategoryBonus;
}

function computeCategoryDiversityBonus(categories: SourceCategory[]) {
  return categories.length <= 1 ? 0 : Math.pow(categories.length - 1, 1.15) * 13;
}

function applySingleSourceCeiling(score: number, occurrences: TopicOccurrence[], sourceIds: string[]) {
  if (sourceIds.length !== 1) {
    return score;
  }

  const tier = sourceTier(sourceIds[0]);
  const lead = occurrences[0];
  const topRankEscape = tier === "core_public" && lead.rank <= 2 ? 20 : 0;
  const engagementEscape = Math.min(90, computeEngagementBonus(lead) * 1.25);
  const ceiling = singleSourceCeilings[tier] + topRankEscape + engagementEscape;

  return Math.min(score, ceiling);
}

function computeEngagementBonus(item: RawHotItem) {
  const stats = item.stats;
  if (!stats) {
    return 0;
  }

  const baseline = sourceStatBaselines[item.sourceId] ?? {
    audience: 200_000,
    reaction: 8_000,
    discussion: 2_000,
    trust: 0.82
  };
  const audience = maxStat(stats.views, stats.reads, stats.plays);
  const reactions =
    sumStats(stats.likes, stats.upvotes, stats.favorites, stats.shares) + sumStats(stats.danmaku) * 0.35;
  const discussion = sumStats(stats.comments, stats.replies) + sumStats(stats.danmaku) * 0.8;
  const opposition = sumStats(stats.dislikes, stats.downvotes);
  const rawBonus =
    normalizedMetric(audience, baseline.audience) * 24 +
    normalizedMetric(reactions, baseline.reaction) * 22 +
    normalizedMetric(discussion, baseline.discussion) * 20 +
    normalizedMetric(opposition, Math.max(100, baseline.discussion * 0.2)) * 6;

  return Math.min(MAX_ENGAGEMENT_BONUS, rawBonus * baseline.trust);
}

function normalizedMetric(value: number, baseline: number) {
  if (!value || value <= 0 || baseline <= 0) {
    return 0;
  }

  return Math.min(1.6, Math.log10(value + 1) / Math.log10(baseline + 1));
}

function maxStat(...values: Array<number | undefined>) {
  return Math.max(0, ...values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
}

function sumStats(...values: Array<number | undefined>) {
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
}

function sourceTier(sourceId: string): SourceTier {
  return sourceTiers[sourceId] ?? "vertical";
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
