import {getDb} from '../db';
import {guardedWrite,readGeneration} from '../maintenance';
import {sourceHash,TopicSharingError} from './source';
import {prepareTopicShareDraft} from './validation';
import type {TopicShareSource,TopicShareCopy,TopicShareRecord} from './types';

function database(){
 const db=getDb();db.exec('create table if not exists topic_shares (id text primary key,revision text not null,payload text not null,created_at integer not null,updated_at integer not null)');return db;
}
export function readTopicShare(id:string):TopicShareRecord|null {
 if(!/^[a-f0-9]{64}$/.test(id))throw new TopicSharingError('分享稿标识无效。');
 const row=database().prepare('select payload from topic_shares where id=?').get(id) as {payload:string}|undefined;
 if(!row)return null;
 const record=JSON.parse(row.payload) as TopicShareRecord;
 const prepared=prepareTopicShareDraft(record.copy,record.source);
 return {...record,copy:prepared.copy,reviewWarnings:prepared.reviewWarnings};
}
export function persistTopicShare(source:TopicShareSource,value:unknown,expectedRevision:string,generation=readGeneration(database())):TopicShareRecord {
 const {copy,reviewWarnings}=prepareTopicShareDraft(value,source),db=database();
 return guardedWrite(db,()=>{
  const id=source.sourceKey,current=readTopicShare(id);
  if((current?.revision??'none')!==expectedRevision)throw new TopicSharingError('分享版本已更新，请载入最新版本后保存。',409);
  const revision=sourceHash({source,copy}),record={id,revision,source,copy,reviewWarnings};
  db.prepare('insert into topic_shares(id,revision,payload,created_at,updated_at) values(?,?,?,?,?) on conflict(id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(id,revision,JSON.stringify(record),Date.now(),Date.now());
  return record;
 },generation);
}
export function saveTopicShareEdits(id:string,copy:TopicShareCopy,expectedRevision:string):TopicShareRecord {
 const db=database(),generation=readGeneration(db),record=readTopicShare(id);if(!record)throw new TopicSharingError('分享稿不存在。',404);
 if(typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))throw new TopicSharingError('请载入分享版本后保存。');
 const preserved={...copy,version:record.copy.version,generatedAt:record.copy.generatedAt,model:record.copy.model,sourceFingerprint:record.copy.sourceFingerprint,editorialPolicy:record.copy.editorialPolicy};
 return persistTopicShare(record.source,preserved,expectedRevision,generation);
}
