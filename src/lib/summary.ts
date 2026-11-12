import { sentimentLabel } from "./sentiment";
import type { DailyDigest, Sentiment, TopicOccurrence, TopicSummary, TopicGroup } from "./types";

export function summarizeTopic(title: string, occurrences: TopicOccurrence[]): TopicSummary {
  const sourceNames = occurrences.map((item) => item.sourceName).join("、");
  const sentiment = sentimentLabelFromTitle(title);

  return {
    oneLine: `${title} 正在 ${sourceNames} 等来源获得注意力。`,
    whyItMatters:
      occurrences.length > 1
        ? "它跨平台出现，说明这不是单一社区的短暂噪音，而是正在进入更广泛的中文互联网注意力场。"
        : "它在单一平台排名靠前，适合作为该社区当日兴趣与情绪的信号。",
    context: `这个话题来自 ${sourceNames}，可先从原始链接理解中文用户的表达方式、梗和争议点。`,
    emotion: `初步情绪判断为「${sentiment}」，后续可由大模型结合评论与上下文复核。`
  };
}

export function buildDailyDigest(date: string, topics: TopicGroup[]): DailyDigest {
  const topTopics = topics.slice(0, 5);
  const dominantSentiments = getDominantSentiments(topics);
  const officialFocus = topics
    .filter((topic) => topic.sourceKinds.includes("official"))
    .slice(0, 5)
    .map((topic) => topic.title);
  const publicFocus = topics
    .filter((topic) => topic.sourceKinds.some((kind) => kind !== "official"))
    .slice(0, 5)
    .map((topic) => topic.title);
  const resonanceTopics = topics
    .filter((topic) => topic.officialPublicResonance)
    .slice(0, 5)
    .map((topic) => topic.title);

  return {
    date,
    generatedAt: new Date().toISOString(),
    headline: topTopics[0]
      ? `今天中文互联网的注意力集中在「${topTopics[0].title}」等话题。`
      : "今天还没有采集到足够的中文互联网热点。",
    overview: buildOverview(topTopics, dominantSentiments, resonanceTopics),
    dominantSentiments,
    officialFocus,
    publicFocus,
    resonanceTopics
  };
}

export async function enrichDigestWithAI(digest: DailyDigest, topics: TopicGroup[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || topics.length === 0) {
    return digest;
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
        messages: [
          {
            role: "system",
            content:
              "你是 WcCAT 的中文互联网文化观察编辑。用中文写克制、准确、面向外国读者的摘要，不夸大，不编造。"
          },
          {
            role: "user",
            content: `请基于这些中文互联网热点，写一段 120 字以内的今日概览，说明注意力、情绪、冲突、兴趣和共识：${topics
              .slice(0, 12)
              .map((topic) => `${topic.rank}. ${topic.title} (${topic.sources.join("/")})`)
              .join("\n")}`
          }
        ]
      })
    });

    if (!response.ok) {
      return digest;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    return content
      ? {
          ...digest,
          overview: content
        }
      : digest;
  } catch {
    return digest;
  }
}

function buildOverview(topics: TopicGroup[], sentiments: Sentiment[], resonanceTopics: string[]) {
  const topicText = topics.map((topic) => `「${topic.title}」`).join("、");
  const sentimentText = sentiments.map(sentimentLabel).join("、") || "中性";
  const resonanceText =
    resonanceTopics.length > 0
      ? `其中 ${resonanceTopics.map((topic) => `「${topic}」`).join("、")} 同时连接官方叙事和民间讨论。`
      : "目前官方媒体与民间社区的高热话题重合度有限。";

  return `今日高热话题包括 ${topicText || "暂无"}。主要情绪呈现为 ${sentimentText}。${resonanceText}`;
}

function getDominantSentiments(topics: TopicGroup[]) {
  const counts = new Map<Sentiment, number>();

  for (const topic of topics.slice(0, 20)) {
    counts.set(topic.sentiment, (counts.get(topic.sentiment) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([sentiment]) => sentiment);
}

function sentimentLabelFromTitle(title: string) {
  if (/[怒骂抵制事故处罚通报]/.test(title)) {
    return "愤怒/担忧";
  }
  if (/[喜欢夺冠爆火好看治愈]/.test(title)) {
    return "喜欢/热爱";
  }
  if (/[为什么如何原因]/.test(title)) {
    return "好奇";
  }
  if (/[争议质疑回应]/.test(title)) {
    return "争议";
  }
  return "中性观察";
}
