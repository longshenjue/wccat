import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createEvidenceSchema,EVIDENCE_TABLES} from './evidence-schema';
import {canonicalEvidence,evidenceHash,evidenceTime,safeEvidenceUrl,sanitizeEvidence} from './evidence-content';
import type {BatchResult,EvidenceBatch,EvidenceItem,EvidenceMetric,EvidenceSource,SearchEvidence} from './evidence-types';

type RunRow={source_id:string;status:string};
type BlobRow={hash:string;encoding:string;data:Buffer;original_bytes:number;truncated:number};
type ObservationRow={id:string;document_id:string;revision_id:string;observed_at:string};
type AnalysisInput={id?:string;purpose:string;provider?:string;model:string;promptVersion:string;schemaVersion?:string;algorithmVersion?:string;
  output:unknown;input?:unknown;observationIds?:string[];searchRunIds?:string[];supersedes?:string;status?:string;inputTokens?:number;outputTokens?:number;
  cost?:number;currency?:string;legacySnapshotDate?:string;legacyTopicId?:string;generatedAt?:string;attemptId?:string;legacyLogId?:number};

const nonempty=(value:string,label:string)=>{if(!value?.trim())throw new Error(label+'不能为空');return value.trim();};

/** Internal repository only: no network, no scheduling and no public exposure. */
export class EvidenceStore {
  private maxBlobBytes:number;
  constructor(readonly db:Database.Database,options:{maxBlobBytes?:number}={}) {
    this.maxBlobBytes=options.maxBlobBytes??2*1024*1024;
    if(!Number.isSafeInteger(this.maxBlobBytes)||this.maxBlobBytes<64)throw new Error('Invalid evidence blob size');
    db.pragma('foreign_keys=ON');
    createEvidenceSchema(db);
  }

  private blob(value:unknown,truncate=false) {
    const safe=sanitizeEvidence(value),encoding=typeof safe==='string'?'utf8':'json';
    let bytes=Buffer.from(encoding==='utf8'?safe as string:canonicalEvidence(safe));
    const original=bytes.length;
    if(original>this.maxBlobBytes) {
      if(!truncate) throw new Error('规范化证据内容超过单条保存上限');
      // Truncated JSON is retained as text, never decoded as complete JSON.
      bytes=Buffer.from(bytes.subarray(0,this.maxBlobBytes).toString('utf8'));
      while(bytes.length>this.maxBlobBytes)bytes=Buffer.from(bytes.subarray(0,bytes.length-1).toString('utf8').replace(/\uFFFD$/u,''));
    }
    const truncated=original>this.maxBlobBytes;
    const actualEncoding=truncated?'utf8':encoding;
    const hash=evidenceHash(actualEncoding+':'+(truncated?original+':':'')+bytes.toString('utf8'));
    const data=gzipSync(bytes);
    this.db.prepare('insert or ignore into library_blobs values(?,?,?,?,?,?,?,?)').run(hash,actualEncoding,'gzip',data,original,data.length,Number(truncated),new Date().toISOString());
    return {hash,truncated};
  }

  readBlob(hash:string):unknown {
    const row=this.db.prepare('select * from library_blobs where hash=?').get(hash) as BlobRow|undefined;
    if(!row) throw new Error('证据内容不存在');
    const bytes=gunzipSync(row.data,{maxOutputLength:this.maxBlobBytes+4});
    const actual=evidenceHash(row.encoding+':'+(row.truncated?row.original_bytes+':':'')+bytes.toString('utf8'));
    if(actual!==row.hash)throw new Error('证据内容校验失败');
    return row.encoding==='json'?JSON.parse(bytes.toString('utf8')):bytes.toString('utf8');
  }

  private source(source:EvidenceSource) {
    for(const [key,value] of Object.entries({provider:source.provider,platform:source.platform,adapter:source.adapter,capability:source.capability}))nonempty(value,key);
    const existing=this.db.prepare('select id from library_sources where provider=? and platform=? and adapter=? and capability=?')
      .get(source.provider,source.platform,source.adapter,source.capability) as {id:string}|undefined;
    if(existing)return existing.id;
    const id=randomUUID();
    this.db.prepare('insert into library_sources values(?,?,?,?,?,?,?,?,?)').run(id,source.provider,source.platform,source.adapter,source.capability,
      source.termsUrl?safeEvidenceUrl(source.termsUrl):null,source.rightsStatus??'unknown',source.rightsNote?String(sanitizeEvidence(source.rightsNote)):null,
      source.rightsStatus?new Date().toISOString():null);
    return id;
  }

  private document(platform:string,item:EvidenceItem,time:string) {
    const url=safeEvidenceUrl(item.url),kind=item.kind??'article';
    const aliases=['url:'+url,...(item.platformId?[kind+':id:'+String(item.platformId)]:[])];
    const matches=aliases.flatMap(alias=>{
      const row=this.db.prepare('select document_id from document_aliases where platform=? and alias=?').get(platform,alias) as {document_id:string}|undefined;
      return row?[row.document_id]:[];
    });
    if(new Set(matches).size>1)throw new Error('文档别名冲突，需要明确合并依据');
    if(matches.length&&item.platformId) {
      const existing=this.db.prepare('select platform_id from library_documents where id=?').get(matches[0]) as {platform_id:string|null};
      if(existing.platform_id&&existing.platform_id!==String(item.platformId))throw new Error('文档身份冲突：相同 URL 已关联其他平台对象 ID');
    }
    const id=matches[0]??randomUUID();
    if(matches.length===0)this.db.prepare('insert into library_documents values(?,?,?,?,?,?,?)').run(id,platform,kind,item.platformId??null,url,time,time);
    else this.db.prepare('update library_documents set first_observed_at=min(first_observed_at,?),last_observed_at=max(last_observed_at,?),platform_id=coalesce(platform_id,?) where id=?').run(time,time,item.platformId??null,id);
    for(const alias of aliases)this.db.prepare('insert or ignore into document_aliases values(?,?,?)').run(platform,alias,id);
    return id;
  }

  recordBatch(input:EvidenceBatch):BatchResult {
    return this.db.transaction(()=>this.batch(input))();
  }

  private batch(input:EvidenceBatch):BatchResult {
    const id=input.id??randomUUID();
    const sourceId=this.source(input.source);
    const prior=this.db.prepare('select source_id,status from collection_runs where id=?').get(id) as RunRow|undefined;
    if(prior) {
      if(prior.source_id!==sourceId)throw new Error('采集 run ID 已属于其他来源');
      const rows=this.db.prepare('select id,document_id from document_observations where run_id=? order by rowid').all(id) as {id:string;document_id:string}[];
      return {runId:id,documentIds:rows.map(v=>v.document_id),observationIds:rows.map(v=>v.id)};
    }
    const time=evidenceTime(input.observedAt),start=evidenceTime(input.startedAt,time),finish=evidenceTime(input.finishedAt,time);
    if(!['running','success','empty','partial','failed'].includes(input.status))throw new Error('Invalid evidence status');
    const response=input.response===undefined?undefined:this.blob(input.response,true);
    const truncated=Boolean(input.responseTruncated||response?.truncated);
    const status=truncated&&['success','empty'].includes(input.status)?'partial':input.status;
    this.db.prepare(`insert into collection_runs values(${Array(21).fill('?').join(',')})`).run(
      id,sourceId,start,finish,time,status,canonicalEvidence(sanitizeEvidence(input.request??{})),response?.hash??null,
      Number(Boolean(input.responseTruncated||response?.truncated)),input.httpStatus??null,input.error?String(sanitizeEvidence(input.error)):null,
      'wccat-evidence-v1',input.provenance??'captured',input.legacySnapshotDate??null,input.sourceUpdatedAt?evidenceTime(input.sourceUpdatedAt):null,
      Number(Boolean(input.cached)),input.items.length,input.cost??null,input.currency??null,input.responseSourceBytes??null,input.responseCapturedBytes??null
    );
    const result:BatchResult={runId:id,documentIds:[],observationIds:[]};
    for(const [index,item] of input.items.entries()) {
      const documentId=this.document(input.source.platform,item,time);
      const duplicate=this.db.prepare('select id,positions_json from document_observations where run_id=? and document_id=?').get(id,documentId) as {id:string;positions_json:string}|undefined;
      if(duplicate) {
        const positions=JSON.parse(duplicate.positions_json) as number[];positions.push(index+1);
        this.db.prepare('update document_observations set positions_json=? where id=?').run(JSON.stringify(positions),duplicate.id);
        continue;
      }
      const content={title:item.title??null,description:item.description??null,text:item.text??null,
        publishedAt:item.publishedAt?evidenceTime(item.publishedAt):null,sourceUpdatedAt:item.sourceUpdatedAt?evidenceTime(item.sourceUpdatedAt):null,
        parentDocumentId:item.parentDocumentId??null,authorKey:item.authorKey??null};
      const contentBlob=this.blob(content);
      let revision=this.db.prepare('select id from document_revisions where document_id=? and content_hash=?').get(documentId,contentBlob.hash) as {id:string}|undefined;
      if(!revision) {
        revision={id:randomUUID()};
        this.db.prepare('insert into document_revisions values(?,?,?,?,?,?,?,?,?,?,?)').run(revision.id,documentId,contentBlob.hash,
          item.title?String(sanitizeEvidence(item.title)):null,item.description?String(sanitizeEvidence(item.description)):null,
          content.publishedAt,content.sourceUpdatedAt,item.parentDocumentId??null,item.authorKey??null,id,time);
      }
      const observationId=randomUUID();
      const payload=this.blob(item.payload??item,true);
      this.db.prepare('insert into document_observations values(?,?,?,?,?,?,?,?,?,?,?,?)').run(observationId,id,documentId,revision.id,time,payload.hash,
        JSON.stringify([index+1]),item.rank??null,item.heatValue??null,item.heatText?String(sanitizeEvidence(item.heatText)):null,item.heatUnit??null,input.legacySnapshotDate??null);
      for(const [metric,value] of Object.entries(item.metrics??{})) {
        const detail:EvidenceMetric=typeof value==='number'||value===null?{value}:value;
        const valid=typeof detail.value==='number'&&Number.isFinite(detail.value)&&detail.value>=0;
        this.db.prepare('insert into metric_observations values(?,?,?,?,?,?,?,?,?)').run(observationId,metric,valid?detail.value:null,
          detail.rawValue??(detail.value===null?null:String(detail.value)),detail.unit??'count',detail.scope??'document',detail.path??null,detail.aliasOf??null,
          detail.status??(valid?'observed':detail.value===null?'missing':'invalid'));
      }
      result.documentIds.push(documentId);result.observationIds.push(observationId);
    }
    return result;
  }

  recordSearch(input:SearchEvidence):BatchResult {
    return this.db.transaction(()=>{
      if(input.source.capability!=='search')throw new Error('搜索记录需要 search 类型来源');
      nonempty(input.query,'query');
      if(new Set(input.hits.map(hit=>hit.position)).size!==input.hits.length||input.hits.some(hit=>!Number.isSafeInteger(hit.position)||hit.position<1))throw new Error('搜索名次必须是唯一正整数');
      const result=this.batch({id:input.id,source:input.source,status:input.status??(input.hits.length?'success':'empty'),
        observedAt:input.observedAt,response:input.response??input.hits,request:{query:input.actualQuery??input.query,filters:input.filters,page:input.page,cursor:input.cursor},items:[]});
      if(this.db.prepare('select run_id from search_runs where run_id=?').get(result.runId)) {
        result.documentIds=(this.db.prepare('select document_id from search_hits where run_id=? order by position').all(result.runId) as {document_id:string}[]).map(row=>row.document_id);
        return result;
      }
      this.db.prepare('update collection_runs set item_count=? where id=?').run(input.hits.length,result.runId);
      const query=String(sanitizeEvidence(input.query.trim().replace(/\s+/g,' '))),filters=canonicalEvidence(sanitizeEvidence(input.filters??{}));
      const key=evidenceHash(canonicalEvidence({query,purpose:input.purpose??'research',language:input.language??null,region:input.region??null,filters}));
      let queryRow=this.db.prepare('select id from search_queries where query_key=?').get(key) as {id:string}|undefined;
      if(!queryRow) {
        queryRow={id:randomUUID()};this.db.prepare('insert into search_queries values(?,?,?,?,?,?,?,?)').run(queryRow.id,key,query,input.purpose??'research',input.language??null,input.region??null,filters,1);
      }
      this.db.prepare('insert into search_runs values(?,?,?,?,?,?)').run(result.runId,queryRow.id,String(sanitizeEvidence(input.actualQuery??input.query)),input.page??1,
        input.cursor?String(sanitizeEvidence(input.cursor)):null,Number(input.complete===true));
      const run=this.db.prepare('select observed_at from collection_runs where id=?').get(result.runId) as {observed_at:string};
      for(const hit of input.hits) {
        const documentId=this.document(input.source.platform,{url:hit.url},run.observed_at);
        this.db.prepare('insert into search_hits values(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),result.runId,documentId,hit.position,hit.globalPosition??null,hit.type??'organic',
          hit.title?String(sanitizeEvidence(hit.title)):null,hit.snippet?String(sanitizeEvidence(hit.snippet)):null,hit.claimedPublishedAt??null,this.blob(hit.payload??hit,true).hash);
        result.documentIds.push(documentId);
      }
      return result;
    })();
  }

  readDocument(id:string) {
    const document=this.db.prepare('select * from library_documents where id=?').get(id) as {id:string;url:string;platform:string}|undefined;
    if(!document)return null;
    const revisions=this.db.prepare('select * from document_revisions where document_id=? order by rowid').all(id) as {id:string;content_hash:string}[];
    const observations=this.db.prepare('select * from document_observations where document_id=? order by observed_at,rowid').all(id) as ObservationRow[];
    return {...document,revisions:revisions.map(row=>({...row,content:this.readBlob(row.content_hash)})),observations:observations.map(row=>({...row,
      metrics:this.db.prepare('select * from metric_observations where observation_id=? order by metric').all(row.id)}))};
  }

  readSearch(id:string) {
    const run=this.db.prepare(`select r.*,q.query,q.language,q.region,q.filters_json,s.provider from search_runs r
      join search_queries q on q.id=r.query_id join collection_runs c on c.id=r.run_id join library_sources s on s.id=c.source_id where r.run_id=?`).get(id) as {provider:string;query:string}|undefined;
    return run?{...run,hits:this.db.prepare('select * from search_hits where run_id=? order by position').all(id) as {position:number;document_id:string}[]}:null;
  }

  createEvent(input:{title:string;startAt?:string;endAt?:string;createdBy?:string}) {
    const id=randomUUID();this.db.prepare('insert into events values(?,?,?,?,?,?,?,?)').run(id,nonempty(input.title,'事件标题'),input.startAt?evidenceTime(input.startAt):null,
      input.endAt?evidenceTime(input.endAt):null,'candidate',input.createdBy??'manual',new Date().toISOString(),1);return id;
  }
  linkEventEvidence(input:{eventId:string;observationId:string;role:string;method:string;reason:string;confidence?:number;reviewed?:boolean;supersedes?:string;state?:'active'|'withdrawn'}) {
    if(input.confidence!==undefined&&(!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1))throw new Error('Invalid confidence');
    const id=randomUUID();this.db.prepare('insert into event_evidence values(?,?,?,?,?,?,?,?,?,?,?)').run(id,input.eventId,input.observationId,input.role,input.method,input.confidence??null,
      String(sanitizeEvidence(nonempty(input.reason,'关联理由'))),Number(input.reviewed===true),input.state??'active',input.supersedes??null,new Date().toISOString());return id;
  }
  recordEventRelation(input:{fromEventId:string;toEventId:string;type:string;status:'hypothesis'|'reviewed';reason:string;observationIds:string[]}) {
    return this.db.transaction(()=>{
      if(input.observationIds.length===0)throw new Error('事件关系必须附证据');
      const id=randomUUID();this.db.prepare('insert into event_relations values(?,?,?,?,?,?,?)').run(id,input.fromEventId,input.toEventId,input.type,input.status,
        String(sanitizeEvidence(nonempty(input.reason,'关系理由'))),new Date().toISOString());
      // Relation evidence uses the same auditable analysis evidence structure.
      const analysis=this.recordAnalysis({purpose:'event-relation',model:'manual',promptVersion:'manual-v1',output:{relationId:id,status:input.status},observationIds:input.observationIds});
      this.db.prepare('insert into analysis_evidence values(?,null,null,?)').run(analysis,id);return id;
    })();
  }
  readEvent(id:string) {
    const event=this.db.prepare('select * from events where id=?').get(id) as {id:string;title:string}|undefined;
    return event?{...event,evidence:this.db.prepare('select * from event_evidence where event_id=? order by rowid').all(id) as {observation_id:string}[],
      relations:this.db.prepare('select * from event_relations where from_event_id=? or to_event_id=? order by rowid').all(id,id)}:null;
  }
  recordAnalysis(input:AnalysisInput) {
    return this.db.transaction(()=>{
      const id=input.id??randomUUID();
      if(this.db.prepare('select id from analysis_records where id=?').get(id))return id;
      const attempt=input.attemptId?this.db.prepare('select input_hash from analysis_records where id=?').get(input.attemptId) as {input_hash:string|null}|undefined:undefined;
      this.db.prepare('insert into analysis_records values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,input.purpose,input.provider??'local',input.model,input.promptVersion,
        input.schemaVersion??'1',input.algorithmVersion??null,this.blob(input.output).hash,input.input===undefined?(attempt?.input_hash??null):this.blob(input.input).hash,evidenceTime(input.generatedAt),input.status??'success',input.supersedes??null,
        input.inputTokens??null,input.outputTokens??null,input.cost??null,input.currency??null,input.legacySnapshotDate??null,input.legacyTopicId??null,input.attemptId??null,input.legacyLogId??null);
      for(const observation of new Set(input.observationIds??[]))this.db.prepare('insert into analysis_evidence values(?,?,null,null)').run(id,observation);
      for(const run of new Set(input.searchRunIds??[]))this.db.prepare('insert into analysis_evidence values(?,null,?,null)').run(id,run);
      return id;
    })();
  }
  stats() {
    const tables=Object.fromEntries(EVIDENCE_TABLES.map(table=>[table,(this.db.prepare('select count(*) as n from '+table).get() as {n:number}).n]));
    const blobs=this.db.prepare('select coalesce(sum(original_bytes),0) as originalBytes,coalesce(sum(stored_bytes),0) as storedBytes from library_blobs').get() as {originalBytes:number;storedBytes:number};
    return {tables,blobs};
  }
}
