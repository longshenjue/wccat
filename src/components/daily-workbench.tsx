"use client";

import { useEffect, useMemo, useState } from "react";
import { getChinaDateTime } from "@/lib/date";
import { InsightImage } from "@/components/insight-image";
import { DailyShare } from "@/components/daily-share";
import type { DailyReportTopic, WccatDailyReport } from "@/lib/daily-report";
import { sentimentLabel } from "@/lib/sentiment";

type DraftKind = "wechat" | "video";

type DailyWorkbenchProps = {
  report: WccatDailyReport;
};

const signalLabels: Record<DailyReportTopic["signal"], string> = {
  dominant: "主导",
  rising: "上升",
  "long-tail": "长尾"
};

const draftLabels: Record<DraftKind, string> = {
  wechat: "公众号文字稿",
  video: "抖音 / B 站口播稿"
};

export function DailyWorkbench({ report }: DailyWorkbenchProps) {
  const [activeTopicId, setActiveTopicId] = useState(report.topics[0]?.id);
  const [activeDraft, setActiveDraft] = useState<DraftKind | null>(null);
  const activeTopic = useMemo(
    () => report.topics.find((topic) => topic.id === activeTopicId) ?? report.topics[0],
    [activeTopicId, report.topics]
  );

  useDailyScrollActivity(activeTopicId);

  return (
    <>
      <section className="content daily-content">
        <header className="topbar editorial-header daily-editorial-header">
          <div className="header-copy">
            <p className="eyebrow">Daily Radar</p>
            <h2>{report.headline}</h2>
            <p className="top-topic-line">
              24 小时观察：
              <span>{report.overview}</span>
            </p>
            <div className="signal-strip" aria-label="日报核心信号">
              <span className="header-signal red">
                <small>Top 10</small>
                <b>{report.topics.length}</b>
              </span>
              <span className="header-signal blue">
                <small>窗口</small>
                <b>24H</b>
              </span>
              <span className="header-signal violet">
                <small>模型</small>
                <b>{report.model}</b>
              </span>
            </div>
          </div>

          <div className="header-facts daily-header-facts">
            <div className="date-card">
              <span>{report.reportDate}</span>
              <small>{getChinaDateTime(new Date(report.generatedAt))}</small>
            </div>
            <div className="source-strip daily-window-strip" aria-label="日报窗口">
              <span>
                Start<b>{report.windowStart}</b>
              </span>
              <span>
                End<b>{report.windowEnd}</b>
              </span>
            </div>
            <div className="daily-draft-actions" aria-label="内容稿">
              <button aria-label="打开公众号文字稿" className="draft-trigger red" onClick={() => setActiveDraft("wechat")} type="button">
                <span />
              </button>
              <button aria-label="打开视频口播稿" className="draft-trigger blue" onClick={() => setActiveDraft("video")} type="button">
                <span />
              </button>
            </div>
            <DailyShare report={report} />
          </div>
        </header>

        <section className="topic-list daily-topic-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">24H Ranking</p>
              <h3>过去 24 小时 Top 10</h3>
            </div>
            <span>{report.topics.length} 个话题</span>
          </div>

          {report.topics.map((topic) => (
            <DailyTopicCard
              isActive={topic.id === activeTopic?.id}
              key={topic.id}
              onSelect={() => setActiveTopicId(topic.id)}
              topic={topic}
            />
          ))}
        </section>
      </section>

      <aside className="right-panel">
        {activeTopic ? <DailyTopicInsight topic={activeTopic} /> : <EmptyDailyInsight />}
      </aside>

      {activeDraft ? (
        <DraftModal
          content={activeDraft === "wechat" ? report.wechatDraft : report.videoScript}
          kind={activeDraft}
          onClose={() => setActiveDraft(null)}
          title={draftLabels[activeDraft]}
        />
      ) : null}
    </>
  );
}

function DailyTopicCard({
  isActive,
  onSelect,
  topic
}: {
  isActive: boolean;
  onSelect: () => void;
  topic: DailyReportTopic;
}) {
  return (
    <article className={isActive ? "active topic-card daily-topic-card" : "topic-card daily-topic-card"} onClick={onSelect}>
      <div className="rank">#{topic.rank}</div>
      <div className="topic-body">
        <div className="topic-title-row">
          <h4>{topic.title}</h4>
          <span className={`signal daily-signal ${topic.signal}`}>{signalLabels[topic.signal]}</span>
        </div>
        <p>{topic.oneLine}</p>
        <div className="topic-meta daily-topic-meta">
          <span>{sentimentLabel(topic.sentiment)}</span>
          <span>持续 {topic.activeHours} 小时</span>
          <span>峰值 #{topic.peakRank}</span>
          <span>{topic.sources.join(" / ")}</span>
        </div>
        <div className="link-row" onClick={(event) => event.stopPropagation()}>
          {topic.links.slice(0, 5).map((link) => (
            <a
              className={`source-chip source-${link.sourceId}`}
              href={link.url}
              key={`${topic.id}-${link.sourceId}-${link.url}`}
              rel="noreferrer"
              target="_blank"
            >
              <span>{link.sourceName.slice(0, 1)}</span>
              {link.sourceName}
            </a>
          ))}
        </div>
      </div>
      <div className="score-badge">{topic.dailyScore}</div>
    </article>
  );
}

function DailyTopicInsight({ topic }: { topic: DailyReportTopic }) {
  const analysis = topic.aiAnalysis;
  const redScore =
    analysis?.battle.redScore ??
    Math.min(100, Math.max(18, Math.round((topic.peakHeatScore / Math.max(topic.dailyScore, 1)) * 100)));
  const blueScore = analysis?.battle.blueScore ?? Math.min(100, Math.max(18, Math.round((topic.activeHours / 24) * 100)));
  const redLabel = analysis?.battle.redLabel ?? "峰值爆发力";
  const blueLabel = analysis?.battle.blueLabel ?? "日内持续力";
  const redRationale =
    analysis?.battle.redRationale ?? `红色侧代表这个话题在某个小时冲到高位的爆发强度，峰值排名 #${topic.peakRank}。`;
  const blueRationale =
    analysis?.battle.blueRationale ?? `蓝色侧代表它在 24 小时内的持续存在感，共出现 ${topic.activeHours} 个小时。`;

  return (
    <section className="detail-card insight-card battle-card daily-insight-card">
      <div className="insight-frame" />
      <div className="insight-head">
        <div>
          <p className="eyebrow">{analysis ? "Tactical Analysis" : "Daily Signal"}</p>
          <small>
            {analysis ? `Daily · ${analysis.model}` : `24H Rank #${topic.rank} · ${sentimentLabel(topic.sentiment)}`}
          </small>
        </div>
        <span className="sync-badge">{topic.dailyScore}</span>
      </div>
      <h3>{topic.title}</h3>

      {topic.cover ? (
        <InsightImage label="24H SIGNAL" src={proxiedImageSrc(topic.cover, topic.coverSourceId)} />
      ) : null}

      <section className="insight-block summary-core">
        <span className="card-label">Summary</span>
        <p>{analysis?.summary ?? topic.oneLine}</p>
      </section>

      <section className="versus-panel">
        <div className="versus-labels">
          <strong>{redLabel}</strong>
          <em>VS</em>
          <strong>{blueLabel}</strong>
        </div>
        <div className="energy-duel" aria-label="日报信号能量">
          <div className="energy red-energy" style={{ width: `${redScore}%` }} />
          <div className="energy blue-energy" style={{ width: `${blueScore}%` }} />
          <span className="energy-score red-score">{redScore}</span>
          <span className="energy-score blue-score">{blueScore}</span>
        </div>
        <div className="duel-rationale">
          <p>{redRationale}</p>
          <p>{blueRationale}</p>
        </div>
      </section>

      <section className="insight-block">
        <span className="card-label">Analysis</span>
        <p>{analysis?.detailedContent ?? topic.whyItMatters}</p>
        {analysis?.outsiderContext ? <p>{analysis.outsiderContext}</p> : null}
      </section>

      <section className="insight-block">
        <span className="card-label">Daily Metrics</span>
        <div className="daily-metric-grid">
          <span>
            日榜分<b>{topic.dailyScore}</b>
          </span>
          <span>
            峰值热度<b>{topic.peakHeatScore}</b>
          </span>
          <span>
            来源数<b>{topic.sources.length}</b>
          </span>
          <span>
            分类数<b>{topic.categories.length}</b>
          </span>
        </div>
      </section>

      <section className="insight-block">
        <span className="card-label">{analysis ? "Platform Matrix" : "Source Links"}</span>
        {analysis ? <DailyPlatformMatrix topic={topic} /> : <DailySourceLinks topic={topic} />}
      </section>
    </section>
  );
}

function DailyPlatformMatrix({ topic }: { topic: DailyReportTopic }) {
  const analysisBySource = new Map(topic.aiAnalysis?.platformAnalyses.map((item) => [item.sourceId, item]));

  return (
    <div className="attitude-list">
      {topic.links.slice(0, 8).map((link, index) => {
        const analysis = analysisBySource.get(link.sourceId);
        return (
          <a
            className={`attitude-row stance-${analysis?.stance ?? "neutral"} source-${link.sourceId}`}
            href={link.url}
            key={`${link.sourceId}-${link.url}-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="source-mark">{link.sourceName.slice(0, 1)}</span>
            <span>
              <b>{link.sourceName}</b>
              <small>{analysis?.attitude ?? link.title}</small>
              {analysis?.evidence ? <i>{analysis.evidence}</i> : null}
            </span>
            <em>{analysis ? `${stanceLabel(analysis.stance)} · ${analysis.confidence}` : "链接"}</em>
          </a>
        );
      })}
    </div>
  );
}

function DailySourceLinks({ topic }: { topic: DailyReportTopic }) {
  return (
    <div className="daily-source-links">
      {topic.links.map((link) => (
        <a href={link.url} key={`${link.sourceId}-${link.url}`} rel="noreferrer" target="_blank">
          <b>{link.sourceName}</b>
          <small>{link.title}</small>
        </a>
      ))}
    </div>
  );
}

function EmptyDailyInsight() {
  return (
    <section className="detail-card insight-card battle-card">
      <div className="insight-frame" />
      <p className="eyebrow">Daily Signal</p>
      <h3>请选择一个日报话题</h3>
      <p>点击中间 Top10 列表后，这里会展示该话题的 24 小时持续度、爆发力和来源链接。</p>
    </section>
  );
}

function DraftModal({
  content,
  kind,
  onClose,
  title
}: {
  content: string;
  kind: DraftKind;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="draft-modal-backdrop" onClick={onClose}>
      <section className={`draft-modal ${kind}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="draft-modal-head">
          <div>
            <p className="eyebrow">Content Draft</p>
            <h3>{title}</h3>
          </div>
          <button aria-label="关闭弹窗" onClick={onClose} type="button">
            CLOSE
          </button>
        </div>
        <pre>{content}</pre>
      </section>
    </div>
  );
}

function useDailyScrollActivity(activeTopicId?: string) {
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

function stanceLabel(stance: "red" | "blue" | "neutral") {
  if (stance === "red") {
    return "红";
  }
  if (stance === "blue") {
    return "蓝";
  }
  return "中立";
}

function proxiedImageSrc(url: string, sourceId = "ai") {
  if (url.startsWith("/api/image")) {
    return url;
  }

  return `/api/image?source=${sourceId}&url=${encodeURIComponent(url)}`;
}
