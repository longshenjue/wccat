import {createHash} from 'node:crypto';
import {getDb,readDailyReportFromDb} from '../db';
import {guardedWrite,readGeneration} from '../maintenance';
import {readTopicShare} from '../topic-sharing/store';
import {topicShareReadiness} from '../topic-sharing/readiness';
import {shareEnRevision,sourceFingerprint} from '../shareen';
import {AdminError} from '../admin-auth';
import {validateShareEnStructure} from '../shareen-validation';
import {dailyPublication,topicPublication} from './projection';
import type {Publication,PublicationPayload,PublicationReference,PublicationRequest} from './types';

export function publicationReference(id:string):PublicationReference{return {id,reference:id.slice(0,8).toUpperCase(),path:'/p/'+id};}
export function preparePublication(input:PublicationRequest):PublicationReference {
 const db=getDb(),generation=readGeneration(db);
 return guardedWrite(db,()=>{
  let payload:PublicationPayload;
  if(input.kind==='topic'){
   const record=readTopicShare(input.id);if(!record)throw new AdminError('分享稿不存在。',404);
   const readiness=topicShareReadiness(record);if(!readiness.ready)throw new AdminError(readiness.message,400);
   if(record.revision!==input.expectedRevision)throw new AdminError('分享版本已更新，请保存或载入最新版本后准备发布。',409);
   payload=topicPublication(record);
  }else{
   const report=readDailyReportFromDb(input.date);if(!report?.shareEn)throw new AdminError('日报分享尚未保存。',404);
   if(shareEnRevision(report.shareEn)!==input.expectedRevision||sourceFingerprint(report)!==input.expectedSourceFingerprint||report.shareEn.sourceFingerprint!==input.expectedSourceFingerprint)throw new AdminError('日报或分享版本已更新，请载入最新版本后准备发布。',409);
   const copy=input.copy?validateShareEnStructure(input.copy,report):report.shareEn;
   if(copy.sourceFingerprint!==input.expectedSourceFingerprint)throw new AdminError('发布文案的来源版本不匹配。',409);
   payload=dailyPublication({...report,shareEn:copy});
  }
  const json=JSON.stringify(payload),hash=createHash('sha256').update(json).digest('hex'),id=hash.slice(0,24);
  const existing=db.prepare('select content_hash from share_publications where id=?').get(id) as {content_hash:string}|undefined;
  if(existing&&existing.content_hash!==hash)throw new AdminError('资料编号冲突，请重试。',409);
  db.prepare('insert or ignore into share_publications(id,content_hash,published_at,report_date,payload) values(?,?,?,?,?)').run(id,hash,new Date().toISOString(),payload.date,json);
  return publicationReference(id);
 },generation);
}
export function readPublication(id:string):Publication|null {
 if(!/^[a-f0-9]{24}$/.test(id))return null;
 const row=getDb().prepare('select payload,published_at from share_publications where id=?').get(id) as {payload:string;published_at:string}|undefined;
 return row?{id,publishedAt:row.published_at,payload:JSON.parse(row.payload) as PublicationPayload}:null;
}
export function listPublications(query:{q?:string;date?:string}={}):Publication[]{
 const q=(query.q??'').trim().slice(0,120),date=/^\d{4}-\d{2}-\d{2}$/.test(query.date??'')?query.date:undefined;
 const rows=getDb().prepare('select id,payload,published_at from share_publications where (? is null or report_date=?) and (?=\'\' or instr(lower(payload),lower(?))>0 or instr(id,lower(?))>0) order by published_at desc,id desc limit 50').all(date??null,date??null,q,q,q) as {id:string;payload:string;published_at:string}[];
 return rows.map(row=>({id:row.id,publishedAt:row.published_at,payload:JSON.parse(row.payload) as PublicationPayload}));
}
