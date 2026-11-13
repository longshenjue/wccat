import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import {dataDir,dbPath} from "./storage-paths";
import {archiveSources,archiveDatabase} from "./archive-catalog";
import {createBusinessSchema} from "./db-schema";
import {ensureMaintenanceSchema,guardedWrite,readGeneration} from "./maintenance";
import type { WccatDailyReport } from "./daily-report";
import type { TopicAnalysis, TopicAnalysisTrace } from "./topic-analysis";
import type { DailySnapshot } from "./types";


let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    mkdirSync(dataDir, { recursive: true });
    const isNew = !existsSync(dbPath);
    db = new Database(dbPath);
    if (isNew) db.pragma("auto_vacuum = INCREMENTAL");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    createBusinessSchema(db);
    ensureMaintenanceSchema(db);
  }

  return db;
}

export function saveSnapshotToDb(snapshot: DailySnapshot, expectedGeneration?: number) {
  return guardedWrite(getDb(), () => {
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
  }, expectedGeneration);
}

export function readSnapshotFromDb(date: string) { return readBestPayload("snapshots","date = ?",[date]) as DailySnapshot | null; }

export function readLatestSnapshotFromDb() { return readBestPayload("snapshots","1=1",[]) as DailySnapshot | null; }

export function readPreviousSnapshotBeforeDateFromDb(date: string) { return readBestPayload("snapshots","date < ?",[date]) as DailySnapshot | null; }

export function listSnapshotDatesFromDb() {
 const dates=new Set<string>();for(const source of readSources())for(const row of source.prepare("select date from snapshots").iterate() as Iterable<{date:string}>)dates.add(row.date);
 return [...dates].sort().reverse();
}

export function readRecentSnapshotsFromDb(limit=24,beforeOrAt?:string):DailySnapshot[] {
 const candidates=new Map<string,{key:string;generated_at:string;source:string}>();
 for(const source of readSources()){
  const rows=source.prepare("select date as key,generated_at from snapshots "+(beforeOrAt?"where date <= ? ":"")+"order by date desc limit ?").all(...(beforeOrAt?[beforeOrAt,limit]:[limit])) as {key:string;generated_at:string}[];
  for(const row of rows){const old=candidates.get(row.key);if(!old||Date.parse(row.generated_at)>Date.parse(old.generated_at))candidates.set(row.key,{...row,source:source.name});}
 }
 return [...candidates.values()].sort((a,b)=>b.key.localeCompare(a.key)).slice(0,limit).reverse().map(row=>{
  const source=row.source===dbPath?getDb():archiveDatabase(row.source);
  return JSON.parse((source.prepare("select payload from snapshots where date=?").get(row.key) as {payload:string}).payload) as DailySnapshot;
 });
}

export function saveDailyReportToDb(report: WccatDailyReport, expectedGeneration?: number) {
  return guardedWrite(getDb(), () => {
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
  }, expectedGeneration);
}

export function saveDailyShareEnglishToDb(report: WccatDailyReport, expectedGeneration?: number) {
  return guardedWrite(getDb(), () => {
  if (!report.shareEnglish) return false;
  // An older translation must not replace a report published by a newer CLI/worker run.
  const result = getDb().prepare(`
    update daily_reports
    set payload = json_set(payload, '$.shareEnglish', json(@translation))
    where report_date = @reportDate and generated_at = @generatedAt
  `).run({
    reportDate: report.reportDate,
    generatedAt: report.generatedAt,
    translation: JSON.stringify(report.shareEnglish)
  });
  return result.changes === 1;
  }, expectedGeneration);
}

export function readDailyReportFromDb(reportDate: string) { return readBestPayload("daily_reports","report_date = ?",[reportDate]) as WccatDailyReport | null; }

export function readLatestDailyReportFromDb() { return readBestPayload("daily_reports","1=1",[]) as WccatDailyReport | null; }

export function listDailyReportDatesFromDb() {
 const dates=new Set<string>();for(const source of readSources())for(const row of source.prepare("select report_date from daily_reports").iterate() as Iterable<{report_date:string}>)dates.add(row.report_date);
 return [...dates].sort().reverse();
}

export function saveTopicAnalysisToDb(
  snapshotDate: string,
  topicId: string,
  analysis: TopicAnalysis,
  expectedGeneration?: number
) {
  return guardedWrite(getDb(), () => {
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
  }, expectedGeneration);
}

export function readTopicAnalysesForDate(snapshotDate: string) {
 const chosen=new Map<string,{payload:string;generated_at:string}>();
 for(const source of readSources())for(const row of source.prepare("select topic_id,payload,generated_at from topic_analyses where snapshot_date=?").all(snapshotDate) as {topic_id:string;payload:string;generated_at:string}[]){
  const old=chosen.get(row.topic_id);if(!old||Date.parse(row.generated_at)>Date.parse(old.generated_at))chosen.set(row.topic_id,row);
 }
 return Object.fromEntries([...chosen].map(([id,row])=>[id,JSON.parse(row.payload) as TopicAnalysis]));
}

export function readRecentTopicAnalysisBeforeDate(snapshotDate:string,topicId:string) {
 let chosen:{snapshotDate:string;payload:string}|undefined;
 for(const source of readSources()){
  const row=source.prepare("select snapshot_date as snapshotDate,payload from topic_analyses where topic_id=? and snapshot_date<? order by snapshot_date desc limit 1").get(topicId,snapshotDate) as typeof chosen;
  if(row&&(!chosen||row.snapshotDate>chosen.snapshotDate))chosen=row;
 }
 return chosen?{snapshotDate:chosen.snapshotDate,analysis:JSON.parse(chosen.payload) as TopicAnalysis}:null;
}

export function saveAiAnalysisLogToDb(
  snapshotDate: string,
  topicId: string,
  trace: TopicAnalysisTrace,
  expectedGeneration?: number
) {
  return guardedWrite(getDb(), () => {
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
  }, expectedGeneration);
}


export function writeGeneration() { return readGeneration(getDb()); }

function* readSources(){yield getDb();yield* archiveSources();}
function readBestPayload(table:"snapshots"|"daily_reports",where:string,args:string[]):unknown {
 const key=table==="snapshots"?"date":"report_date";
 let chosen:{key:string;generated_at:string;source:string}|undefined;
 for(const source of readSources()){
  const row=source.prepare("select "+key+" as key,generated_at from "+table+" where "+where+" order by "+key+" desc limit 1").get(...args) as {key:string;generated_at:string}|undefined;
  if(row&&(!chosen||row.key>chosen.key||(row.key===chosen.key&&Date.parse(row.generated_at)>Date.parse(chosen.generated_at))))chosen={...row,source:source.name};
 }
 if(!chosen)return null;
 const source=chosen.source===dbPath?getDb():archiveDatabase(chosen.source);
 return JSON.parse((source.prepare("select payload from "+table+" where "+key+"=?").get(chosen.key) as {payload:string}).payload);
}
