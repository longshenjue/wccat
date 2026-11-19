import { getChinaSnapshotId } from "./date";
import {
  listSnapshotDatesFromDb,
  readLatestSnapshotFromDb,
  readPreviousSnapshotBeforeDateFromDb,
  readSnapshotFromDb,
  saveSnapshotToDb,
  writeGeneration
} from "./db";
import { fetchAllSources } from "./ingest";
import { precomputeTopicAnalyses } from "./precompute";
import { applyRankSignals, buildTopicRanking } from "./ranking";
import { getActiveSources, SOURCES } from "./sources";
import { buildDailyDigest, enrichDigestWithAI } from "./summary";
import { enrichTopicImages } from "./image-enrichment";
import type { DailySnapshot } from "./types";
import {getDb} from './db';
import {guardedWrite} from './maintenance';
import {EvidenceStore} from './evidence-store';
import {withEvidenceCapture} from './evidence-capture';
import {getTianApiClient} from './tianapi/runtime';
import {fetchTianAuxiliary,attachTianContext} from './tianapi/context';

export async function createDailySnapshot(date = getChinaSnapshotId(),generation?:number): Promise<DailySnapshot> {
  const activeSources = getActiveSources();
  const evidenceRunIds:string[]=[];
  const client=await getTianApiClient();
  const [rawItems,auxiliary] = await withEvidenceCapture(batch=>{
    const db=getDb();
    const recorded=guardedWrite(db,()=>new EvidenceStore(db).recordBatch({...batch,legacySnapshotDate:date}),generation);
    evidenceRunIds.push(recorded.runId);
  },()=>Promise.all([fetchAllSources(activeSources,{tianapi:client??null}),fetchTianAuxiliary(client)]));
  const previousSnapshot = readPreviousSnapshotBeforeDateFromDb(date);
  const rankedTopics = attachTianContext(applyRankSignals(buildTopicRanking(rawItems), previousSnapshot?.topics ?? []),auxiliary);
  const topics = await enrichTopicImages(rankedTopics);
  const digest = await enrichDigestWithAI(buildDailyDigest(date, topics), topics);

  return {
    date,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    rawItems,
    topics,
    digest,
    evidenceRunIds
  };
}

export async function saveSnapshot(snapshot: DailySnapshot, generation?: number) {
  saveSnapshotToDb(snapshot, generation);
}

export async function refreshSnapshot(date = getChinaSnapshotId()) {
  const generation = writeGeneration();
  const snapshot = await createDailySnapshot(date,generation);
  if (snapshot.rawItems.length === 0) {
    return readSnapshotFromDb(date) ?? readLatestSnapshotFromDb() ?? snapshot;
  }
  await saveSnapshot(snapshot, generation);
  await precomputeTopicAnalyses(snapshot);
  return snapshot;
}

export async function getSnapshot(date?: string) {
  if (date) {
    return readSnapshotFromDb(date) ?? emptySnapshot(date);
  }

  return readLatestSnapshotFromDb() ?? emptySnapshot(getChinaSnapshotId());
}

export async function listSnapshotDates() {
  return listSnapshotDatesFromDb();
}

function emptySnapshot(date: string): DailySnapshot {
  return {
    date,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    rawItems: [],
    topics: [],
    digest: {...buildDailyDigest(date, []), headline: `${date} 暂无小时记录`, overview: "该小时记录尚未采集或已清理。已生成的日报仍可在日报页查看。"}
  };
}
