import {getDb} from './db';
import {getChinaSnapshotId} from './date';
import {getDailyReportWindow} from './daily-window';
import {resolveSnapshots,sourceDb} from './snapshot-reader';
import type {DailySnapshot} from './types';
import type {TopicAnalysis} from './topic-analysis';

/** Target boundaries stay fixed even when observation ends before the cutoff. */
export function readDailyReportInput(cutoff:Date,observedUntil=new Date()) {
 const window=getDailyReportWindow(cutoff);
 const through=new Date(Math.min(window.end.getTime(),observedUntil.getTime()));
 const analyses:Record<string,Record<string,TopicAnalysis>>={};
 const snapshots=getDb().transaction(()=>{
  if(through<=window.start)return [] as DailySnapshot[];
  const rows=resolveSnapshots(getChinaSnapshotId(window.start),getChinaSnapshotId(window.end),{after:window.start.toISOString(),through:through.toISOString()});
  return rows.map(row=>{
   const db=sourceDb(row.source);
   analyses[row.date]=Object.fromEntries((db.prepare('select topic_id,payload from topic_analyses where snapshot_date=?').all(row.date) as {topic_id:string;payload:string}[]).map(value=>[value.topic_id,JSON.parse(value.payload)]));
   return JSON.parse((db.prepare('select payload from snapshots where date=?').get(row.date) as {payload:string}).payload) as DailySnapshot;
  });
 }).deferred();
 snapshots.sort((a,b)=>Date.parse(a.generatedAt)-Date.parse(b.generatedAt));
 const times=snapshots.map(snapshot=>snapshot.generatedAt);
 return {...window,snapshots,analyses,collection:{observedUntil:observedUntil.toISOString(),complete:observedUntil>=window.end,sampleCount:snapshots.length,firstCollectedAt:times[0],lastCollectedAt:times.at(-1)}};
}
