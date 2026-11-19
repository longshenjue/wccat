import './load-env';
import {getTianApiClient} from '../src/lib/tianapi/runtime';
import {TIANAPI_ENDPOINTS,type TianEndpoint} from '../src/lib/tianapi/catalog';
import {getChinaDate} from '../src/lib/date';
import {EvidenceStore} from '../src/lib/evidence-store';
import {withEvidenceCapture,emitEvidenceBatch} from '../src/lib/evidence-capture';
import {guardedWrite,readGeneration} from '../src/lib/maintenance';
import {redactJobMessage} from '../src/lib/log-redaction';
import type {EvidenceStatus} from '../src/lib/evidence-types';

async function main(){
 const [action,selected,...extra]=process.argv.slice(2);
 if(!['status','check'].includes(action)||extra.length||(action==='status'&&selected))throw new Error('Usage: npm run tianapi -- status | check [endpoint]');
 if(selected&&!TIANAPI_ENDPOINTS.includes(selected as TianEndpoint))throw new Error('未知 TianAPI endpoint: '+selected);
 const client=await getTianApiClient();
 if(!client){if(action==='check')throw new Error('TIANAPI_KEY 未配置或 TianAPI 已关闭');console.log(JSON.stringify({configured:false,endpoints:[]}));return;}
 try{
  if(action==='status'){
   const state=client.status();console.log(JSON.stringify({configured:true,endpoints:client.config.endpoints,dailyLimit:client.config.dailyLimit,cacheMinutes:30,
    usage:state.usage.filter(row=>row.day===getChinaDate()),cache:state.endpoints},null,2));return;
  }
  const endpoints=selected?[selected as TianEndpoint]:client.config.endpoints;
  if(!endpoints.length||endpoints.some(endpoint=>!client.enabled(endpoint)))throw new Error('选定的 TianAPI 接口未启用');
  const generation=readGeneration(client.state.db),store=new EvidenceStore(client.state.db);
  const results:Array<{endpoint:TianEndpoint;status:EvidenceStatus;items:number;cached:boolean;observedAt?:string;error?:string}>=[];
  await withEvidenceCapture(batch=>guardedWrite(client.state.db,()=>{store.recordBatch(batch);},generation),async()=>{
   for(const endpoint of endpoints){const result=(await client.fetch(endpoint))!;await emitEvidenceBatch(result.batch);
    results.push({endpoint,status:result.batch.status,items:result.items.length,cached:result.batch.cached??false,observedAt:result.batch.observedAt,error:result.batch.error});}
  });
  console.log(JSON.stringify(results,null,2));if(results.some(result=>!['success','empty'].includes(result.status)))process.exitCode=1;
 }finally{client.state.db.close();}
}
main().catch(error=>{console.error(redactJobMessage(error instanceof Error?error.message:'TianAPI check failed'));process.exitCode=1;});
