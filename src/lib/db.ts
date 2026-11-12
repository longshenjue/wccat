import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { WccatDailyReport } from "./daily-report";
import type { TopicAnalysis, TopicAnalysisTrace } from "./topic-analysis";
import type { DailySnapshot } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "wccat.sqlite");

let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    mkdirSync(dataDir, { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }

  return db;
}

export function saveSnapshotToDb(snapshot: DailySnapshot) {
  const database = getDb();
  const insertSnapshot = database.prepare(`
    insert into snapshots (date, generated_at, payload)
    values (@date, @generatedAt, @payload)
    on conflict(date) do update set
      generated_at = excluded.generated_at,
      payload = excluded.payload
  `);
  const deleteRawItems = database.prepare("delete from raw_items where snapshot_date = ?");
  const insertRawItem = database.prepare(`
    insert into raw_items (
      snapshot_date, source_id, source_name, source_kind, source_category,
      rank, title, url, description, cover, heat_text, heat_value, stats_payload, fetched_at
    )
    values (
      @snapshotDate, @sourceId, @sourceName, @sourceKind, @sourceCategory,
      @rank, @title, @url, @description, @cover, @heatText, @heatValue, @statsPayload, @fetchedAt
    )
  `);
  const deleteTopics = database.prepare("delete from topics where snapshot_date = ?");
  const insertTopic = database.prepare(`
    insert into topics (
      snapshot_date, topic_id, rank, title, heat_score, sentiment,
      signal, official_public_resonance, payload
    )
    values (
      @snapshotDate, @topicId, @rank, @title, @heatScore, @sentiment,
      @signal, @officialPublicResonance, @payload
    )
  `);

  const write = database.transaction(() => {
    insertSnapshot.run({
      date: snapshot.date,
      generatedAt: snapshot.generatedAt,
      payload: JSON.stringify(snapshot)
    });

    deleteRawItems.run(snapshot.date);
    for (const item of snapshot.rawItems) {
      insertRawItem.run({
        snapshotDate: snapshot.date,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        sourceKind: item.sourceKind,
        sourceCategory: item.sourceCategory,
        rank: item.rank,
        title: item.title,
        url: item.url,
        description: item.description ?? null,
        cover: item.cover ?? null,
        heatText: item.heatText ?? null,
        heatValue: item.heatValue ?? null,
        statsPayload: item.stats ? JSON.stringify(item.stats) : null,
        fetchedAt: item.fetchedAt
      });
    }

    deleteTopics.run(snapshot.date);
    for (const topic of snapshot.topics) {
      insertTopic.run({
        snapshotDate: snapshot.date,
        topicId: topic.id,
        rank: topic.rank,
        title: topic.title,
        heatScore: topic.heatScore,
        sentiment: topic.sentiment,
        signal: topic.signal,
        officialPublicResonance: topic.officialPublicResonance ? 1 : 0,
        payload: JSON.stringify(topic)
      });
    }
  });

  write();
}

export function readSnapshotFromDb(date: string) {
  const row = getDb()
    .prepare("select payload from snapshots where date = ?")
    .get(date) as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as DailySnapshot) : null;
}

export function readLatestSnapshotFromDb() {
  const row = getDb()
    .prepare("select payload from snapshots order by date desc limit 1")
    .get() as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as DailySnapshot) : null;
}

export function readPreviousSnapshotBeforeDateFromDb(date: string) {
  const row = getDb()
    .prepare("select payload from snapshots where date < ? order by date desc limit 1")
    .get(date) as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as DailySnapshot) : null;
}

export function listSnapshotDatesFromDb() {
  const rows = getDb()
    .prepare("select date from snapshots order by date desc")
    .all() as Array<{ date: string }>;

  return rows.map((row) => row.date);
}

export function readRecentSnapshotsFromDb(limit = 24, beforeOrAt?: string) {
  const database = getDb();
  const rows = beforeOrAt
    ? (database
        .prepare("select payload from snapshots where date <= ? order by date desc limit ?")
        .all(beforeOrAt, limit) as Array<{ payload: string }>)
    : (database
        .prepare("select payload from snapshots order by date desc limit ?")
        .all(limit) as Array<{ payload: string }>);

  return rows.map((row) => JSON.parse(row.payload) as DailySnapshot).reverse();
}

export function saveDailyReportToDb(report: WccatDailyReport) {
  getDb()
    .prepare(
      `
        insert into daily_reports (report_date, generated_at, model, payload)
        values (@reportDate, @generatedAt, @model, @payload)
        on conflict(report_date) do update set
          generated_at = excluded.generated_at,
          model = excluded.model,
          payload = excluded.payload
      `
    )
    .run({
      reportDate: report.reportDate,
      generatedAt: report.generatedAt,
      model: report.model,
      payload: JSON.stringify(report)
    });
}

export function saveDailyShareEnglishToDb(report: WccatDailyReport) {
  if (!report.shareEnglish) return;
  // An older translation must not replace a report published by a newer CLI/worker run.
  getDb().prepare(`
    update daily_reports
    set payload = json_set(payload, '$.shareEnglish', json(@translation))
    where report_date = @reportDate and generated_at = @generatedAt
  `).run({
    reportDate: report.reportDate,
    generatedAt: report.generatedAt,
    translation: JSON.stringify(report.shareEnglish)
  });
}

export function readDailyReportFromDb(reportDate: string) {
  const row = getDb()
    .prepare("select payload from daily_reports where report_date = ?")
    .get(reportDate) as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as WccatDailyReport) : null;
}

export function readLatestDailyReportFromDb() {
  const row = getDb()
    .prepare("select payload from daily_reports order by report_date desc limit 1")
    .get() as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as WccatDailyReport) : null;
}

export function listDailyReportDatesFromDb() {
  const rows = getDb()
    .prepare("select report_date as reportDate from daily_reports order by report_date desc")
    .all() as Array<{ reportDate: string }>;

  return rows.map((row) => row.reportDate);
}

export function saveTopicAnalysisToDb(
  snapshotDate: string,
  topicId: string,
  analysis: TopicAnalysis
) {
  getDb()
    .prepare(
      `
        insert into topic_analyses (snapshot_date, topic_id, model, generated_at, payload)
        values (@snapshotDate, @topicId, @model, @generatedAt, @payload)
        on conflict(snapshot_date, topic_id) do update set
          model = excluded.model,
          generated_at = excluded.generated_at,
          payload = excluded.payload
      `
    )
    .run({
      snapshotDate,
      topicId,
      model: analysis.model,
      generatedAt: new Date().toISOString(),
      payload: JSON.stringify(analysis)
    });
}

export function readTopicAnalysesForDate(snapshotDate: string) {
  const rows = getDb()
    .prepare("select topic_id as topicId, payload from topic_analyses where snapshot_date = ?")
    .all(snapshotDate) as Array<{ topicId: string; payload: string }>;

  return Object.fromEntries(
    rows.map((row) => [row.topicId, JSON.parse(row.payload) as TopicAnalysis])
  );
}

export function readRecentTopicAnalysisBeforeDate(snapshotDate: string, topicId: string) {
  const row = getDb()
    .prepare(
      `
        select snapshot_date as snapshotDate, payload
        from topic_analyses
        where topic_id = ?
          and snapshot_date < ?
        order by snapshot_date desc
        limit 1
      `
    )
    .get(topicId, snapshotDate) as { snapshotDate: string; payload: string } | undefined;

  return row
    ? {
        snapshotDate: row.snapshotDate,
        analysis: JSON.parse(row.payload) as TopicAnalysis
      }
    : null;
}

export function saveAiAnalysisLogToDb(
  snapshotDate: string,
  topicId: string,
  trace: TopicAnalysisTrace
) {
  getDb()
    .prepare(
      `
        insert into ai_analysis_logs (
          snapshot_date, topic_id, provider, model, status, duration_ms,
          used_fallback, error, request_payload, response_payload, created_at
        )
        values (
          @snapshotDate, @topicId, @provider, @model, @status, @durationMs,
          @usedFallback, @error, @requestPayload, @responsePayload, @createdAt
        )
      `
    )
    .run({
      snapshotDate,
      topicId,
      provider: trace.provider,
      model: trace.model,
      status: trace.status,
      durationMs: trace.durationMs,
      usedFallback: trace.usedFallback ? 1 : 0,
      error: trace.error ?? null,
      requestPayload: JSON.stringify(trace.request),
      responsePayload: JSON.stringify(trace.response),
      createdAt: new Date().toISOString()
    });
}

function migrate(database: Database.Database) {
  database.exec(`
    create table if not exists snapshots (
      date text primary key,
      generated_at text not null,
      payload text not null
    );

    create table if not exists raw_items (
      id integer primary key autoincrement,
      snapshot_date text not null,
      source_id text not null,
      source_name text not null,
      source_kind text not null,
      source_category text not null,
      rank integer not null,
      title text not null,
      url text not null,
      description text,
      cover text,
      heat_text text,
      heat_value real,
      stats_payload text,
      fetched_at text not null,
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create index if not exists raw_items_snapshot_source_idx
      on raw_items(snapshot_date, source_id, rank);

    create table if not exists topics (
      id integer primary key autoincrement,
      snapshot_date text not null,
      topic_id text not null,
      rank integer not null,
      title text not null,
      heat_score integer not null,
      sentiment text not null,
      signal text not null,
      official_public_resonance integer not null,
      payload text not null,
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create index if not exists topics_snapshot_rank_idx
      on topics(snapshot_date, rank);

    create table if not exists topic_analyses (
      snapshot_date text not null,
      topic_id text not null,
      model text not null,
      generated_at text not null,
      payload text not null,
      primary key(snapshot_date, topic_id),
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create table if not exists ai_analysis_logs (
      id integer primary key autoincrement,
      snapshot_date text not null,
      topic_id text not null,
      provider text not null,
      model text not null,
      status text not null,
      duration_ms integer not null,
      used_fallback integer not null,
      error text,
      request_payload text not null,
      response_payload text not null,
      created_at text not null
    );

    create index if not exists ai_analysis_logs_snapshot_topic_idx
      on ai_analysis_logs(snapshot_date, topic_id, created_at);

    create table if not exists daily_reports (
      report_date text primary key,
      generated_at text not null,
      model text not null,
      payload text not null
    );
  `);

  ensureColumn(database, "raw_items", "stats_payload", "text");
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const columns = database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}
