import {AdminError,adminErrorResponse,readAdminJson,requireAdmin} from '@/lib/admin-auth';
import {getChinaDate} from '@/lib/date';
import {createJob} from '@/lib/admin-jobs';
import {parseTopicShareRef,loadTopicShareSource,TopicSharingError,topicSharePayload,readTopicShare,saveTopicShareEdits} from '@/lib/topic-sharing/service';
import {editorialShortlist} from '@/lib/topic-sharing/shortlist';
import {recommendTopic} from '@/lib/topic-sharing/recommendation';
import {EDITORIAL_COLUMNS} from '@/lib/topic-sharing/columns';
import type {EditorialColumn,TopicShareCopy} from '@/lib/topic-sharing/types';
import {topicShareBaseFingerprint} from '@/lib/topic-sharing/source-identity';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown){
 return adminErrorResponse(error instanceof AdminError?error:new AdminError(error instanceof Error?error.message:'单话题分享操作失败。',error instanceof TopicSharingError?error.status:400));
}
export async function GET(request:Request){
 try{
  requireAdmin(request);const query=new URL(request.url).searchParams;
  if(query.get('action')==='recommendations')return json(editorialShortlist(query.get('date')??getChinaDate()));
  if(query.has('id')){
   const record=readTopicShare(query.get('id')!);if(!record)throw new TopicSharingError('分享稿不存在。',404);
   return json({source:record.source,recommendation:recommendTopic(record.source),record});
  }
  const ref=query.get('ref');if(!ref||ref.length>2000)throw new AdminError('请选择小时报或日报话题。');
  let parsed:unknown;try{parsed=JSON.parse(ref);}catch{throw new AdminError('话题引用格式无效。');}
  return json(topicSharePayload(parsed));
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{
  requireAdmin(request,true);const body=await readAdminJson(request,256*1024);
  if(body.action==='save'){
   if(typeof body.id!=='string'||typeof body.expectedRevision!=='string')throw new AdminError('分享标识或版本无效。');
   const record=saveTopicShareEdits(body.id,body.copy as TopicShareCopy,body.expectedRevision);
   return json({source:record.source,recommendation:recommendTopic(record.source),record});
  }
  if(body.action!=='generate')throw new AdminError('单话题操作无效。');
  if(body.force!==undefined&&typeof body.force!=='boolean')throw new AdminError('强制生成参数无效。');
  const ref=parseTopicShareRef(body.ref),source=loadTopicShareSource(ref);
  if(body.column!==undefined&&!EDITORIAL_COLUMNS.some(item=>item.id===body.column))throw new AdminError('未知的分享栏目。');
  const current=readTopicShare(source.sourceKey),expected=current?.revision??'none';
  if(body.expectedSourceFingerprint!==source.fingerprint&&!(current&&body.expectedSourceFingerprint===current.source.fingerprint&&topicShareBaseFingerprint(current.source)===source.fingerprint))throw new TopicSharingError('来源内容已更新，请重新载入后生成。',409);
  if(body.expectedRevision!==undefined&&body.expectedRevision!==expected)throw new TopicSharingError('分享版本已更新，请载入最新版本。',409);
  if(current&&body.force===true&&body.expectedRevision===undefined)throw new AdminError('重新生成需要当前分享版本。');
  return json({job:createJob({kind:'topic-sharing',topicRef:source.ref,column:body.column as EditorialColumn|undefined,force:body.force===true,expectedRevision:expected,expectedSourceFingerprint:source.fingerprint})},202);
 }catch(error){return failure(error);}
}
