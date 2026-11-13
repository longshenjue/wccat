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

export async function createDailySnapshot(date = getChinaSnapshotId()): Promise<DailySnapshot> {
  const activeSources = getActiveSources();
  const rawItems = await fetchAllSources(activeSources);
  const previousSnapshot = readPreviousSnapshotBeforeDateFromDb(date);
  const rankedTopics = applyRankSignals(buildTopicRanking(rawItems), previousSnapshot?.topics ?? []);
  const topics = await enrichTopicImages(rankedTopics);
  const digest = await enrichDigestWithAI(buildDailyDigest(date, topics), topics);

  return {
    date,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    rawItems,
    topics,
    digest
  };
}

export async function saveSnapshot(snapshot: DailySnapshot, generation?: number) {
  saveSnapshotToDb(snapshot, generation);
}

export async function refreshSnapshot(date = getChinaSnapshotId()) {
  const generation = writeGeneration();
  const snapshot = await createDailySnapshot(date);
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
    digest: buildDailyDigest(date, [])
  };
}
