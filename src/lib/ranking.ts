import {scorePlatformItems} from "./platform-ranking";
import { normalizeTitle, titleSimilarity, topicIdFromTitle } from "./normalize";
import { inferSentiment } from "./sentiment";
import type { AttentionSignal, RawHotItem, TopicGroup, TopicOccurrence } from "./types";
import { summarizeTopic } from "./summary";

export function buildTopicRanking(rawItems: RawHotItem[]): TopicGroup[] {
  const occurrences = scorePlatformItems(rawItems);
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
  const sourceKinds = unique(sorted.map((item) => item.sourceKind));
  const categories = unique(sorted.map((item) => item.sourceCategory));
  const officialPublicResonance =
    sourceKinds.includes("official") && sourceKinds.some((kind) => kind !== "official");
  const baseScore = computeSourceContributions(sorted);
  const heatScore = Math.round(baseScore);

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

/** One bounded contribution per platform, including when several posts describe the same topic. */
function computeSourceContributions(occurrences: TopicOccurrence[]) {
  const scores=new Map<string,number>();
  for(const occurrence of occurrences)scores.set(occurrence.sourceId,Math.max(scores.get(occurrence.sourceId)??0,occurrence.platformScore));
  return [...scores.values()].reduce((sum,value)=>sum+value,0);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
