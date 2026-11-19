import type Database from 'better-sqlite3';
import type {DailySnapshot,TopicGroup,RawHotItem} from './types';
import type {TopicAnalysis,TopicAnalysisTrace} from './topic-analysis';
import {EvidenceStore} from './evidence-store';
import {canonicalEvidence,evidenceHash,safeEvidenceUrl,sanitizeEvidence} from './evidence-content';
import {legacyEvidenceItem} from './evidence-mapping';

/** Called inside the existing snapshot transaction. Live captures already have richer evidence. */
export function recordSnapshotEvidence(db:Database.Database,snapshot:DailySnapshot) {
  if(snapshot.evidenceRunIds?.length) {
    for(const id of snapshot.evidenceRunIds) {
      const row=db.prepare('select legacy_snapshot_date from collection_runs where id=?').get(id) as {legacy_snapshot_date:string}|undefined;
      if(row?.legacy_snapshot_date!==snapshot.date)throw new Error('快照引用的采集证据不存在或属于其他小时');
    }
    return;
  }
  const store=new EvidenceStore(db),groups=new Map<string,RawHotItem[]>();
  for(const item of snapshot.rawItems){const group=groups.get(item.sourceId)??[];group.push(item);groups.set(item.sourceId,group);}
  for(const [platform,items] of groups)store.recordBatch({
    id:'snapshot:'+evidenceHash(canonicalEvidence({date:snapshot.date,generatedAt:snapshot.generatedAt,platform,items})),
    source:{provider:'snapshot',platform,adapter:'normalized-snapshot-v1',capability:'hotlist'},
    status:'success',observedAt:items[0].fetchedAt,provenance:'normalized_snapshot',legacySnapshotDate:snapshot.date,
    items:items.map(legacyEvidenceItem)
  });
}

export function recordLegacyAnalysis(db:Database.Database,snapshotDate:string,topicId:string,analysis:TopicAnalysis,inputRunIds?:string[],meta?:{id?:string;generatedAt?:string;topic?:TopicGroup;attemptId?:string}) {
  const row=db.prepare('select payload from topics where snapshot_date=? and topic_id=?').get(snapshotDate,topicId) as {payload:string}|undefined;
  const topic=meta?.topic??(row?JSON.parse(row.payload) as TopicGroup:undefined);
  const snapshot=db.prepare('select payload from snapshots where date=?').get(snapshotDate) as {payload:string}|undefined;
  const runIds=inputRunIds??(snapshot?(JSON.parse(snapshot.payload) as DailySnapshot).evidenceRunIds:undefined);
  const allowed=runIds?.length?new Set(runIds):undefined;
  const observationIds:string[]=[];
  for(const item of topic?.occurrences??[]) {
    const observations=db.prepare(`select o.id,o.run_id from document_observations o join document_aliases a on a.document_id=o.document_id
      where o.legacy_snapshot_date=? and a.platform=? and a.alias=? order by o.observed_at desc,o.rowid desc`)
      .all(snapshotDate,item.sourceId,'url:'+safeEvidenceUrl(item.url)) as {id:string;run_id:string}[];
    const chosen=observations.find(observation=>!allowed||allowed.has(observation.run_id));if(chosen)observationIds.push(chosen.id);
  }
  for(const context of topic?.supplementalEvidence??[]){
    if(allowed&&!allowed.has(context.runId))continue;
    const observation=db.prepare(`select o.id from document_observations o join document_aliases a on a.document_id=o.document_id
      where o.legacy_snapshot_date=? and o.run_id=? and a.platform=? and a.alias=?`).get(snapshotDate,context.runId,context.platform,'url:'+safeEvidenceUrl(context.url)) as {id:string}|undefined;
    if(observation)observationIds.push(observation.id);
  }
  const store=new EvidenceStore(db);
  if(meta?.id) {
    const prior=db.prepare("select id,output_hash from analysis_records where purpose='topic-analysis' and legacy_snapshot_date=? and legacy_topic_id=? and model=? order by rowid desc")
      .all(snapshotDate,topicId,analysis.model) as {id:string;output_hash:string}[];
    const match=prior.find(record=>canonicalEvidence(store.readBlob(record.output_hash))===canonicalEvidence(sanitizeEvidence(analysis)));
    if(match)return match.id;
  }
  let promptVersion=meta?.id?'legacy-unknown':'unknown';
  if(meta?.attemptId) {
    const attempt=db.prepare("select legacy_snapshot_date,legacy_topic_id,prompt_version from analysis_records where id=? and purpose='topic-analysis-attempt'").get(meta.attemptId) as {legacy_snapshot_date:string;legacy_topic_id:string;prompt_version:string}|undefined;
    if(attempt?.legacy_snapshot_date!==snapshotDate||attempt?.legacy_topic_id!==topicId)throw new Error('分析尝试与本次话题不匹配');
    promptVersion=attempt.prompt_version;
  }
  const previous=db.prepare("select id from analysis_records where purpose='topic-analysis' and legacy_snapshot_date=? and legacy_topic_id=? order by rowid desc limit 1").get(snapshotDate,topicId) as {id:string}|undefined;
  return new EvidenceStore(db).recordAnalysis({id:meta?.id,generatedAt:meta?.generatedAt,purpose:'topic-analysis',provider:analysis.model==='local-rules'?'local':'deepseek',model:analysis.model,
    promptVersion,algorithmVersion:meta?.id?undefined:'ranking-v2.1',output:analysis,observationIds,supersedes:previous?.id,
    legacySnapshotDate:snapshotDate,legacyTopicId:topicId,attemptId:meta?.attemptId});
}

/** Preserve the exact sanitized request, including article contexts and the actual system prompt. */
export function recordAnalysisTrace(db:Database.Database,snapshotDate:string,topicId:string,trace:TopicAnalysisTrace,meta?:{id?:string;generatedAt?:string;legacyLogId?:number}) {
  if(meta?.legacyLogId!==undefined) {
    const prior=db.prepare('select id from analysis_records where legacy_log_id=?').get(meta.legacyLogId) as {id:string}|undefined;
    if(prior)return prior.id;
  }
  const request=trace.request as {messages?:Array<{role?:string;content?:unknown}>}|undefined;
  const prompt=request?.messages?.filter(message=>message.role==='system').map(message=>message.content)??[];
  return new EvidenceStore(db).recordAnalysis({id:meta?.id,purpose:'topic-analysis-attempt',provider:trace.provider,model:trace.model,
    promptVersion:'sha256:'+evidenceHash(canonicalEvidence(prompt)),input:trace.request,output:trace.response,status:trace.status,
    generatedAt:meta?.generatedAt,legacySnapshotDate:snapshotDate,legacyTopicId:topicId,legacyLogId:meta?.legacyLogId});
}
