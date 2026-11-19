import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/data-fixtures';
import {ProviderState} from '../src/lib/provider-state';
import {TianApiClient,readTianApiConfig} from '../src/lib/tianapi/client';
import {fetchSource} from '../src/lib/ingest';
import {getSourceById} from '../src/lib/sources';
import {withEvidenceCapture} from '../src/lib/evidence-capture';
import {attachTianContext,fetchTianAuxiliary} from '../src/lib/tianapi/context';
import {buildTopicRanking} from '../src/lib/ranking';
import {analyzeTopicWithDeepSeek} from '../src/lib/topic-analysis';
import {fetchArticleContexts} from '../src/lib/fulltext';
import {EvidenceStore} from '../src/lib/evidence-store';
import {acquireMaintenance,advanceGeneration,releaseMaintenance} from '../src/lib/maintenance';
import type {EvidenceBatch} from '../src/lib/evidence-types';
import type {DailySnapshot} from '../src/lib/types';

let ctx:Awaited<ReturnType<typeof testDatabase>>;before(async()=>{ctx=await testDatabase();});after(()=>ctx.close());
const key='integration-key-only-83fe';
let clientSequence=0;
function client(fetcher:typeof fetch,endpoints='weibohot,networkhot,wxhottopic'){
 let now=Date.parse('2026-11-19T05:00:00Z');
 return new TianApiClient(new ProviderState(ctx.getDb()),readTianApiConfig({TIANAPI_KEY:key+'-'+(++clientSequence),TIANAPI_ENDPOINTS:endpoints})!,{fetch:fetcher,now:()=>now,sleep:async ms=>{now+=ms;}});
}

test('configured canonical provider supplies one feed and failed provider falls back with separate evidence',async t=>{
 const old=globalThis.fetch;let legacyCalls=0;
 globalThis.fetch=async()=>{legacyCalls++;return Response.json({data:{realtime:[{word:'原渠道事件',num:12}]}});};t.after(()=>{globalThis.fetch=old;});
 const batches:EvidenceBatch[]=[];
 const good=client(async()=>Response.json({code:200,msg:'success',result:{list:[{hotword:'现场事件',hotwordnum:'12',hottag:'热'}]}}));
 const items=await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(getSourceById('weibo')!,{tianapi:good}));
 assert.equal(items.length,1);assert.equal(items[0].provider,'tianapi');assert.equal(items[0].sourceId,'weibo');assert.equal(legacyCalls,0);assert.equal(batches[0].source.provider,'tianapi');
 const bad=client(async()=>Response.json({code:160,msg:'no permission'}),'weibohot');
 const fallback=await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(getSourceById('weibo')!,{tianapi:bad}));
 assert.equal(fallback[0].title,'原渠道事件');assert.equal(legacyCalls,1);assert.equal(batches[1].status,'failed');assert.equal(batches[2].source.provider,'direct');
});

test('supplementary hotlists reach actual AI input and analysis evidence without changing scores',async t=>{
 const old=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;t.after(()=>{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;});
 const c=client(async url=>{
  const endpoint=new URL(String(url)).pathname.split('/')[1];return Response.json({code:200,msg:'success',result:{list:endpoint==='weibohot'?[{hotword:'完整现场事件',hotwordnum:'5',hottag:''}]:endpoint==='networkhot'?[{title:'完整现场事件',digest:'新增聚合证据内容',hotnum:500},{title:'完整现场事件官方回应',digest:'不应错误匹配的材料',hotnum:999}]:[{word:'完整现场事件',index:9}]}});
 },'weibohot,networkhot,wxhottopic');
 const date='2026-11-19-13',store=new EvidenceStore(ctx.getDb()),runIds:string[]=[];
 const collected=await withEvidenceCapture(batch=>{runIds.push(store.recordBatch({...batch,legacySnapshotDate:date}).runId);},async()=>({items:await fetchSource(getSourceById('weibo')!,{tianapi:c}),auxiliary:await fetchTianAuxiliary(c)}));
 const base=buildTopicRanking(collected.items),enriched=attachTianContext(base,collected.auxiliary);
 assert.equal(enriched[0].heatScore,base[0].heatScore);assert.deepEqual(enriched[0].sources,base[0].sources);assert.equal(enriched[0].supplementalEvidence?.length,2);
 assert.equal(JSON.stringify(enriched).includes('不应错误匹配的材料'),false);
 const snap:DailySnapshot={date,generatedAt:new Date().toISOString(),rawItems:collected.items,topics:enriched,sources:[],evidenceRunIds:runIds,digest:{date,generatedAt:new Date().toISOString(),headline:'测试',overview:'测试',dominantSentiments:[],officialFocus:[],publicFocus:[],resonanceTopics:[]}};
 ctx.saveSnapshotToDb(snap);let prompt='';let attemptId:string|undefined;
 const analysis=await analyzeTopicWithDeepSeek(enriched[0],[],undefined,trace=>{prompt=JSON.stringify(trace.request);attemptId=ctx.saveAiAnalysisLogToDb(date,enriched[0].id,trace);});
 assert.ok(prompt.includes('新增聚合证据内容'));assert.ok(prompt.includes('supplementalEvidence'));
 ctx.saveTopicAnalysisToDb(date,enriched[0].id,analysis,undefined,runIds,{topic:enriched[0],attemptId});
 const refs=ctx.getDb().prepare("select count(*) n from analysis_evidence e join analysis_records a on a.id=e.analysis_id where a.legacy_snapshot_date=? and a.purpose='topic-analysis'").get(date) as {n:number};
 assert.equal(refs.n,3);
});

test('topic search pages are not fetched as article text but existing article extraction remains usable',async t=>{
 const old=globalThis.fetch,urls:string[]=[];globalThis.fetch=async input=>{urls.push(String(input));return new Response('<html><body>实际文章内容</body></html>');};t.after(()=>{globalThis.fetch=old;});
 const raw={sourceId:'weibo',sourceName:'微博',sourceKind:'public' as const,sourceCategory:'social' as const,rank:1,title:'标题',url:'https://s.weibo.com/weibo?q=title',fetchedAt:new Date().toISOString(),normalizedTitle:'标题',platformScore:100};
 const contexts=await fetchArticleContexts([{...raw,contentType:'topic'},{...raw,url:'https://example.test/article',contentType:'article'}]);
 assert.deepEqual(urls,['https://example.test/article']);assert.equal(contexts.length,1);assert.ok(contexts[0].text.includes('实际文章内容'));
});

test('maintenance during TianAPI request rejects delayed cache and ingestion writes',async()=>{
 const c=client(async()=>{acquireMaintenance(ctx.getDb(),'test');advanceGeneration(ctx.getDb(),'test');releaseMaintenance(ctx.getDb(),'test');return Response.json({code:200,msg:'success',result:{list:[{hotword:'过期结果',hotwordnum:'1'}]}});},'weibohot,wxhottopic');
 await assert.rejects(()=>withEvidenceCapture(()=>{},()=>fetchSource(getSourceById('weibo')!,{tianapi:c})),/数据版本/);
});

test('actual snapshot refresh activates all six configured endpoints and only four canonical ranked feeds',async t=>{
 const names=['TIANAPI_KEY','TIANAPI_ENDPOINTS','DEEPSEEK_API_KEY','WCCAT_IMAGE_ENRICHMENT'];
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]])),old=globalThis.fetch;
 process.env.TIANAPI_KEY='snapshot-refresh-secret-abc9';delete process.env.TIANAPI_ENDPOINTS;delete process.env.DEEPSEEK_API_KEY;process.env.WCCAT_IMAGE_ENRICHMENT='off';
 t.after(()=>{globalThis.fetch=old;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}});
 const calls:string[]=[];
 globalThis.fetch=async input=>{
  const url=String(input);if(!url.startsWith('https://apis.tianapi.com/'))return Response.json({data:[]});
  const endpoint=new URL(url).pathname.split('/')[1];calls.push(endpoint);
  const row=endpoint==='weibohot'?{hotword:'实际刷新事件',hotwordnum:'123',hottag:'热'}:endpoint==='nethot'?{keyword:'实际刷新事件',brief:'百度内容',index:'123',trend:'rise'}:endpoint==='networkhot'?{title:'实际刷新事件',digest:'聚合补充内容',hotnum:123}:endpoint==='wxhottopic'?{word:'实际刷新事件',index:9}:{word:'实际刷新事件',hotindex:123,label:3};
  return Response.json({code:200,msg:'success',result:{list:[row]}});
 };
 const {createDailySnapshot}=await import('../src/lib/store');
 const snap=await createDailySnapshot('2026-11-19-14',ctx.writeGeneration());
 assert.deepEqual(calls.sort(),['douyinhot','nethot','networkhot','toutiaohot','weibohot','wxhottopic']);
 assert.deepEqual(snap.rawItems.map(item=>item.sourceId).sort(),['baidu','douyin','toutiao','weibo']);
 assert.equal(snap.topics.length,1);assert.equal(snap.topics[0].supplementalEvidence?.length,2);
 ctx.saveSnapshotToDb(snap);
 assert.ok(ctx.readSnapshotFromDb(snap.date)?.topics[0].supplementalEvidence?.some(e=>e.description==='聚合补充内容'));
});
