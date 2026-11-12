import { getSnapshot, listSnapshotDates } from "@/lib/store";
import Link from "next/link";
import { TopicWorkbench } from "@/components/topic-workbench";
import { readTopicAnalysesForDate } from "@/lib/db";
import type { SourceCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ date?: string; source?: string }>;
};

const categoryLabels: Record<SourceCategory, string> = {
  social: "社交",
  search: "搜索",
  video: "视频",
  news: "新闻",
  business: "商业",
  community: "社区"
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

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const requestedSnapshot = params.date;
  const selectedSource = params.source;
  const snapshot = await getSnapshot(requestedSnapshot);
  const selectedDate = snapshot.date;
  const analyses = readTopicAnalysesForDate(snapshot.date);
  const dates = await listSnapshotDates();
  const topics = selectedSource
    ? snapshot.topics.filter((topic) =>
        topic.occurrences.some((item) => item.sourceId === selectedSource)
      )
    : snapshot.topics;
  const activeSources = snapshot.sources.filter((source) =>
    snapshot.rawItems.some((item) => item.sourceId === source.id)
  );

  return (
    <main className="shell">
      <aside className="left-rail">
        <div className="brand-card">
          <h1 className="brand-logo">
            <span className="brand-wc">Wc</span>
            <span className="brand-cat">CAT</span>
          </h1>
          <p>每小时更新</p>
        </div>

        <nav className="nav-card" aria-label="模式">
          <span className="nav-title">Mode</span>
          <Link className="active nav-link" href={`/?date=${selectedDate}`}>
            小时榜
          </Link>
          <Link className="nav-link" href="/daily">
            日报
          </Link>
        </nav>

        <nav className="nav-card" aria-label="来源">
          <span className="nav-title">Sources</span>
          <a
            className={!selectedSource ? "active nav-link source-link source-all" : "nav-link source-link source-all"}
            href={`/?date=${selectedDate}`}
          >
            <span className="source-mark">全</span>
            <span className="source-copy">
              <b>全部来源</b>
              <small>All platforms</small>
            </span>
          </a>
          {activeSources.map((source) => (
            <a
              className={
                selectedSource === source.id
                  ? `active nav-link source-link source-${source.id}`
                  : `nav-link source-link source-${source.id}`
              }
              href={`/?date=${selectedDate}&source=${source.id}`}
              key={source.id}
            >
              <span className="source-mark">{sourceMarks[source.id] ?? source.displayName.slice(0, 1)}</span>
              <span className="source-copy">
                <b>{source.displayName}</b>
                <small>{categoryLabels[source.category]}</small>
              </span>
            </a>
          ))}
        </nav>

        <section className="nav-card">
          <span className="nav-title">Archive</span>
          {[selectedDate, ...dates.filter((date) => date !== selectedDate)].slice(0, 8).map((date) => (
            <a className={date === selectedDate ? "active nav-link" : "nav-link"} href={`/?date=${date}`} key={date}>
              {date}
            </a>
          ))}
        </section>
      </aside>

      <TopicWorkbench
        digest={snapshot.digest}
        generatedAt={snapshot.generatedAt}
        rawItemCount={snapshot.rawItems.length}
        storedAnalyses={analyses}
        selectedDate={selectedDate}
        selectedSource={selectedSource}
        topics={topics}
      />
    </main>
  );
}
