"use client";

import { useEffect, useMemo, useState } from "react";
import { getChinaDateTime } from "@/lib/date";
import { InsightImage } from "@/components/insight-image";
import { normalizeExternalUrl } from "@/lib/links";
import { inferSentiment, sentimentLabel } from "@/lib/sentiment";
import { buildFallbackTopicAnalysis, type TopicAnalysis } from "@/lib/topic-analysis";
import type { DailyDigest, Sentiment, TopicGroup, TopicOccurrence } from "@/lib/types";

type TopicWorkbenchProps = {
  digest: DailyDigest;
  generatedAt: string;
  rawItemCount: number;
  selectedDate: string;
  selectedSource?: string;
  storedAnalyses: Record<string, TopicAnalysis>;
  topics: TopicGroup[];
};

const sourceMarks: Record<string, string> = {
  weibo: "微",
  baidu: "百",
  zhihu: "知",
  bilibili: "B",
  thepaper: "澎",
  toutiao: "头",
  douban: "豆",
  hupu: "虎",
  xiaohongshu: "红",
  douyin: "抖",
  tieba: "贴",
  ngabbs: "N",
  "36kr": "氪",
  ithome: "IT",
  "qq-news": "腾",
  "sina-news": "新",
  "netease-news": "网",
  huxiu: "嗅",
  sspai: "派"
};

const sourceTone: Record<string, string> = {
  weibo: "公共情绪更强，容易放大争议、娱乐和突发事件。",
  baidu: "搜索意图更强，说明用户正在主动查证或理解这个话题。",
  zhihu: "解释和争辩更强，通常会转向原因、责任和方法讨论。",
  bilibili: "视频叙事更强，常通过二创、评论和弹幕形成年轻文化语境。",
  thepaper: "媒体叙事更强，偏向事件背景、公共议题和事实梳理。",
  toutiao: "资讯分发更强，代表大众新闻流中的即时注意力。",
  douban: "生活方式和兴趣小组语境更强，适合观察长尾情绪与日常经验。",
  hupu: "社区对抗和男性兴趣语境更强，适合观察体育、数码和社会话题的站队。",
  xiaohongshu: "消费、生活方式和种草语境更强，适合观察女性用户和城市生活趋势。",
  douyin: "短视频传播更强，适合观察大众娱乐和即时情绪扩散。",
  tieba: "垂直吧内讨论更强，适合观察兴趣圈层和早期争议苗头。",
  ngabbs: "游戏社区语境更强，适合观察玩家圈层对版本、厂商和事件的态度。",
  "36kr": "商业科技语境更强，适合观察公司、资本和消费市场议题。",
  ithome: "科技数码语境更强，适合观察硬件、产品和技术消费热点。",
  "qq-news": "门户新闻语境更强，适合观察大众新闻流中的关注重点。",
  "sina-news": "传统门户新闻语境更强，适合观察社会新闻和综合资讯扩散。",
  "netease-news": "新闻客户端语境更强，适合观察大众阅读和评论场景。",
  huxiu: "商业观察语境更强，适合观察产业解读和科技公司叙事。",
  sspai: "数字生活社区语境更强，适合观察效率工具和小众科技消费。"
};

const sentimentClass: Record<Sentiment, string> = {
  love: "positive",
  like: "positive",
  anger: "heated",
  dislike: "heated",
  anxiety: "anxious",
  debate: "debate",
  curiosity: "curious",
  entertainment: "playful",
  neutral: "neutral"
};

export function TopicWorkbench({
  digest,
  generatedAt,
  rawItemCount,
  selectedDate,
  selectedSource,
  storedAnalyses,
  topics
}: TopicWorkbenchProps) {
  const [activeTopicId, setActiveTopicId] = useState(topics[0]?.id);
  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === activeTopicId) ?? topics[0],
    [activeTopicId, topics]
  );
  const fallbackAnalysis = useMemo(
    () => (activeTopic ? buildFallbackTopicAnalysis(activeTopic) : null),
    [activeTopic]
  );
  const storedAnalysis = activeTopic ? storedAnalyses[activeTopic.id] : undefined;
  const analysis = storedAnalysis ?? fallbackAnalysis;
  const analysisLoading = Boolean(activeTopic && !storedAnalysis);

  useScrollActivity(activeTopicId);

  return (
    <>
      <section className="content">
        <HeaderPanel
          digest={digest}
          generatedAt={generatedAt}
          rawItemCount={rawItemCount}
          selectedDate={selectedDate}
          topics={topics}
        />

        <section className="topic-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ranking</p>
              <h3>{selectedSource ? "来源榜" : "今日总榜"}</h3>
            </div>
            <span>{topics.length} 个话题</span>
          </div>

          {topics.slice(0, 50).map((topic) => (
            <TopicCard
              isActive={topic.id === activeTopic?.id}
              key={topic.id}
              onSelect={() => setActiveTopicId(topic.id)}
              topic={topic}
            />
          ))}
        </section>
      </section>

      <aside className="right-panel">
        {activeTopic && analysis ? (
          <TopicInsight analysis={analysis} isLoading={analysisLoading} topic={activeTopic} />
        ) : (
          <EmptyInsight />
        )}
      </aside>
    </>
  );
}

function useScrollActivity(activeTopicId?: string) {
  useEffect(() => {
    const selectors = [".left-rail", ".content", ".insight-card.battle-card"];
    const timers = new WeakMap<Element, number>();
    const cleanups: Array<() => void> = [];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const activate = () => {
        element.classList.add("scroll-active");
        const existingTimer = timers.get(element);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }
        timers.set(
          element,
          window.setTimeout(() => {
            element.classList.remove("scroll-active");
          }, 500)
        );
      };

      element.addEventListener("scroll", activate, { passive: true });
      element.addEventListener("wheel", activate, { passive: true });
      cleanups.push(() => {
        const existingTimer = timers.get(element);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }
        element.classList.remove("scroll-active");
        element.removeEventListener("scroll", activate);
        element.removeEventListener("wheel", activate);
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [activeTopicId]);
}

function HeaderPanel({
  digest,
  generatedAt,
  rawItemCount,
  selectedDate,
  topics
}: {
  digest: DailyDigest;
  generatedAt: string;
  rawItemCount: number;
  selectedDate: string;
  topics: TopicGroup[];
}) {
  const topSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const topic of topics.slice(0, 30)) {
      for (const source of topic.sources) {
        counts.set(source, (counts.get(source) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
  }, [topics]);
  const topTopicTitle = topics[0]?.title ?? "暂无热点";
  const topTopicLine = buildTopTopicLine(topics);
  const headerSignals = useMemo(() => buildHeaderSignals(topics), [topics]);

  return (
    <header className="topbar editorial-header">
      <div className="header-copy">
        <p className="eyebrow">Today</p>
        <h2>当前最热话题「{topTopicTitle}」</h2>
        <p className="top-topic-line">
          其他高热话题：
          <span>{topTopicLine}</span>
        </p>
        <div className="signal-strip" aria-label="本小时情绪分布">
          {headerSignals.map((item) => (
            <SignalPill item={item} key={item.label} />
          ))}
        </div>
      </div>
      <div className="header-facts">
        <div className="date-card">
          <span>{selectedDate}</span>
          <small>{getChinaDateTime(new Date(generatedAt))}</small>
        </div>
        <div className="fact-grid">
          <StatTile label="入库源数据" value={rawItemCount} />
          <StatTile label="聚合话题" value={topics.length} />
          <StatTile label="共振话题" value={digest.resonanceTopics.length} />
        </div>
        <div className="source-strip" aria-label="今日高频来源">
          {topSources.map(([source, count]) => (
            <span key={source}>
              {source}
              <b>{count}</b>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

type HeaderSignal = {
  label: string;
  value: string;
  tone: "red" | "blue" | "violet" | "cyan";
};

function SignalPill({ item }: { item: HeaderSignal }) {
  return (
    <span className={`header-signal ${item.tone}`}>
      <small>{item.label}</small>
      <b>{item.value}</b>
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TopicCard({
  isActive,
  onSelect,
  topic
}: {
  isActive: boolean;
  onSelect: () => void;
  topic: TopicGroup;
}) {
  const lead = topic.occurrences[0];

  return (
    <article className={isActive ? "active topic-card" : "topic-card"} id={topic.id} onClick={onSelect}>
      <div className="rank">{topic.rank}</div>
      <div className="topic-body">
        <div className="topic-title-row">
          <h4>{topic.title}</h4>
          <span className={`signal ${topic.signal}`}>{signalLabel(topic.signal)}</span>
        </div>
        <p>{topic.summary.oneLine}</p>
        <div className="link-row" onClick={(event) => event.stopPropagation()}>
          {topic.occurrences.slice(0, 5).map((item) => (
            <a
              className={`source-chip source-${item.sourceId}`}
              href={externalHref(item)}
              key={`${item.sourceId}-${item.rank}-${item.title}`}
              rel="noreferrer"
              target="_blank"
            >
              <span>{sourceMarks[item.sourceId] ?? item.sourceName.slice(0, 1)}</span>
              {item.sourceName} #{item.rank}
            </a>
          ))}
        </div>
      </div>
      {lead?.cover ? <img alt="" className="topic-thumb" src={proxiedImageSrc(lead.cover, lead.sourceId)} /> : null}
    </article>
  );
}

function TopicInsight({
  analysis,
  isLoading,
  topic
}: {
  analysis: TopicAnalysis;
  isLoading: boolean;
  topic: TopicGroup;
}) {
  const heroImage = topic.occurrences.find((item) => item.cover);

  return (
    <section className="detail-card insight-card battle-card">
      <div className="insight-frame" />
      <div className="insight-head">
        <div>
          <p className="eyebrow">Tactical Analysis</p>
          <small>{analysis.model === "local-rules" ? "Local rules" : `DeepSeek · ${analysis.model}`}</small>
        </div>
        <span className={isLoading ? "sync-badge loading" : "sync-badge"}>{isLoading ? "SYNC" : topic.heatScore}</span>
      </div>
      <h3>{topic.title}</h3>

      {heroImage ? (
        <InsightImage label="LIVE SIGNAL" src={proxiedImageSrc(heroImage.cover as string, heroImage.sourceId)} />
      ) : null}

      <section className="insight-block summary-core">
        <span className="card-label">Summary</span>
        <p>{analysis.summary}</p>
      </section>

      <section className="versus-panel">
        <div className="versus-labels">
          <strong>{analysis.battle.redLabel}</strong>
          <em>VS</em>
          <strong>{analysis.battle.blueLabel}</strong>
        </div>
        <div className="energy-duel" aria-label="观点能量对抗">
          <div className="energy red-energy" style={{ width: `${analysis.battle.redScore}%` }} />
          <div className="energy blue-energy" style={{ width: `${analysis.battle.blueScore}%` }} />
          <span className="energy-score red-score">{analysis.battle.redScore}</span>
          <span className="energy-score blue-score">{analysis.battle.blueScore}</span>
        </div>
        <div className="duel-rationale">
          <p>{analysis.battle.redRationale}</p>
          <p>{analysis.battle.blueRationale}</p>
        </div>
      </section>

      <section className="insight-block">
        <span className="card-label">Analysis</span>
        <p>{analysis.detailedContent}</p>
        <p>{analysis.outsiderContext}</p>
      </section>

      <section className="insight-block">
        <span className="card-label">Platform Matrix</span>
        <PlatformAttitudes analysis={analysis} occurrences={topic.occurrences} />
      </section>
    </section>
  );
}

function PlatformAttitudes({
  analysis,
  occurrences
}: {
  analysis: TopicAnalysis;
  occurrences: TopicOccurrence[];
}) {
  const fallbackBySource = new Map<string, TopicOccurrence>();
  for (const occurrence of occurrences) {
    if (!fallbackBySource.has(occurrence.sourceId)) {
      fallbackBySource.set(occurrence.sourceId, occurrence);
    }
  }
  const platformAnalyses = uniquePlatformAnalyses(analysis.platformAnalyses).slice(0, 8);

  return (
    <div className="attitude-list">
      {platformAnalyses.map((item, index) => {
        const original = fallbackBySource.get(item.sourceId);
        const sentiment = original
          ? inferSentiment(`${original.title} ${original.description ?? ""}`)
          : "neutral";
        return (
          <a
            className={`attitude-row ${sentimentClass[sentiment]} stance-${item.stance} source-${item.sourceId}`}
            href={original ? externalHref(original) : "#"}
            key={`${item.sourceId}-${item.sourceName}-${item.stance}-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="source-mark">{sourceMarks[item.sourceId] ?? item.sourceName.slice(0, 1)}</span>
            <span>
              <b>{item.sourceName}</b>
              <small>{item.attitude}</small>
              <i>{item.evidence}</i>
            </span>
            <em>{stanceLabel(item.stance)} · {item.confidence}</em>
          </a>
        );
      })}
    </div>
  );
}

function uniquePlatformAnalyses(items: TopicAnalysis["platformAnalyses"]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.sourceId || item.sourceName;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function EmptyInsight() {
  return (
    <section className="detail-card">
      <p>还没有可展示的话题。请稍后刷新快照。</p>
    </section>
  );
}

function signalLabel(signal: TopicGroup["signal"]) {
  const labels: Record<TopicGroup["signal"], string> = {
    rising: "上升",
    steady: "稳定",
    cooling: "下降",
    new: "新"
  };

  return labels[signal];
}

function buildHeaderSignals(topics: TopicGroup[]) {
  const sample = topics.slice(0, 50);
  if (sample.length === 0) {
    return [{ label: "暂无热点", value: "0%", tone: "violet" }] satisfies HeaderSignal[];
  }

  const tones: HeaderSignal["tone"][] = ["red", "blue", "violet", "cyan"];
  return topCounts(sample.map(topicSignalLabel), 4).map(([label, count], index) => ({
    label,
    value: `${Math.round((count / sample.length) * 100)}%`,
    tone: tones[index % tones.length]
  }));
}

function topicSignalLabel(topic: TopicGroup) {
  if (topic.sentiment === "debate" || topic.sentiment === "anger" || topic.sentiment === "dislike") {
    return "争议";
  }
  if (topic.sentiment === "entertainment" || topic.categories.includes("video")) {
    return "娱乐";
  }
  if (topic.sentiment === "curiosity") {
    return "求证";
  }
  if (topic.sentiment === "anxiety") {
    return "焦虑";
  }
  if (topic.categories.includes("business")) {
    return "科技商业";
  }
  if (topic.categories.includes("community")) {
    return "社区讨论";
  }
  if (topic.categories.includes("news") || topic.categories.includes("search")) {
    return "公共事件";
  }

  return sentimentSignalLabel(topic.sentiment);
}

function sentimentSignalLabel(sentiment: Sentiment) {
  const labels: Record<Sentiment, string> = {
    love: "热爱",
    like: "好感",
    anger: "争议",
    dislike: "负面",
    curiosity: "求证",
    anxiety: "焦虑",
    debate: "争议",
    entertainment: "娱乐",
    neutral: "公共事件"
  };
  return labels[sentiment];
}

function topCounts(values: string[], limit: number) {
  return Object.entries(countBy(values))
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {} as Record<T, number>);
}

function stanceLabel(stance: "red" | "blue" | "neutral") {
  const labels = {
    red: "红侧",
    blue: "蓝侧",
    neutral: "中立"
  };

  return labels[stance];
}

function proxiedImageSrc(url: string, sourceId: string) {
  return `/api/image?source=${encodeURIComponent(sourceId)}&url=${encodeURIComponent(url)}`;
}

function externalHref(item: TopicOccurrence) {
  return normalizeExternalUrl(item.url, item.sourceId, item.title);
}

function buildTopTopicLine(topics: TopicGroup[]) {
  const nextTopics = topics
    .slice(1, 4)
    .map((topic) => `「${topic.title}」`)
    .join("、");

  return nextTopics || "暂无其他高热话题。";
}
