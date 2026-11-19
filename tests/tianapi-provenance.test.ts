import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,testDatabase} from './helpers/data-fixtures';
import {EvidenceStore} from '../src/lib/evidence-store';

let ctx:Awaited<ReturnType<typeof testDatabase>>;before(async()=>{ctx=await testDatabase();});after(()=>ctx.close());
function evidenceSnapshot(date:string){
 const value=snapshot(date,date.slice(0,10)+'T04:00:00Z');ctx.saveSnapshotToDb(value);const store=new EvidenceStore(ctx.getDb());
 const url='https://www.baidu.com/s?wd='+encodeURIComponent(value.topics[0].title);
 const aux=store.recordBatch({source:{provider:'tianapi',platform:'tianapi-network',adapter:'networkhot-v1',capability:'hotlist'},legacySnapshotDate:date,status:'success',items:[{url,title:value.topics[0].title,description:'待追溯的补充材料'}]});
 value.evidenceRunIds=(ctx.getDb().prepare('select id from collection_runs where legacy_snapshot_date=?').all(date) as {id:string}[]).map(row=>row.id);
 value.topics[0].supplementalEvidence=[{provider:'tianapi',platform:'tianapi-network',endpoint:'networkhot',title:value.topics[0].title,url,description:'待追溯的补充材料',observedAt:value.generatedAt,rank:1,runId:aux.runId}];
 ctx.saveSnapshotToDb(value);return value;
}
function noKey(t:{after:(callback:()=>void)=>void}){
 const old=process.env.DEEPSEEK_API_KEY,fetcher=globalThis.fetch;delete process.env.DEEPSEEK_API_KEY;globalThis.fetch=async()=>new Response('<html><body>已有文章正文</body></html>');
 t.after(()=>{globalThis.fetch=fetcher;if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;});
}
function assertAnalysis(date:string){
 const row=ctx.getDb().prepare("select id,input_hash,attempt_id from analysis_records where legacy_snapshot_date=? and purpose='topic-analysis' order by rowid desc limit 1").get(date) as {id:string;input_hash:string;attempt_id:string}|undefined;
 assert.ok(row);assert.ok(row.attempt_id);assert.ok(JSON.stringify(new EvidenceStore(ctx.getDb()).readBlob(row.input_hash)).includes('待追溯的补充材料'));
 assert.equal((ctx.getDb().prepare('select count(*) n from analysis_evidence where analysis_id=?').get(row.id) as {n:number}).n,2);
}
test('daily TOP1 fallback retains the actual prompt and auxiliary observations without modifying hourly conclusions',async t=>{
 noKey(t);const value=evidenceSnapshot('2026-11-18-12');const {generateDailyReport}=await import('../src/lib/daily-report');
 await generateDailyReport(new Date('2026-11-19T02:00:00+08:00'),{log:()=>{}});assertAnalysis(value.date);
 assert.equal((ctx.getDb().prepare('select count(*) n from topic_analyses where snapshot_date=?').get(value.date) as {n:number}).n,0);
});
test('undated manual analysis resolves actual supplied runs and persists an evidence-only conclusion',async t=>{
 noKey(t);const old=process.env.NODE_ENV;(process.env as Record<string,string|undefined>).NODE_ENV='development';
 t.after(()=>{if(old===undefined)delete (process.env as Record<string,string|undefined>).NODE_ENV;else (process.env as Record<string,string|undefined>).NODE_ENV=old;});
 const value=evidenceSnapshot('2026-11-17-12');const {POST}=await import('../src/app/api/analyze-topic/route');
 const response=await POST(new Request('http://localhost/api/analyze-topic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value.topics[0])}));assert.equal(response.status,200);assertAnalysis(value.date);
 assert.equal((ctx.getDb().prepare('select count(*) n from topic_analyses where snapshot_date=?').get(value.date) as {n:number}).n,0);
});
test('cover enrichment skips topic search pages and can still use real article covers',async t=>{
 const old=process.env.WCCAT_IMAGE_ENRICHMENT,fetcher=globalThis.fetch;delete process.env.WCCAT_IMAGE_ENRICHMENT;const urls:string[]=[];
 globalThis.fetch=async input=>{urls.push(String(input));return new Response('<meta property="og:image" content="https://example.test/story-cover.jpg">');};
 t.after(()=>{globalThis.fetch=fetcher;if(old===undefined)delete process.env.WCCAT_IMAGE_ENRICHMENT;else process.env.WCCAT_IMAGE_ENRICHMENT=old;});
 const topic=snapshot('2026-11-19-12').topics[0];topic.occurrences=[{...topic.occurrences[0],url:'https://www.baidu.com/s?wd=event',contentType:'topic'},{...topic.occurrences[0],url:'https://example.test/article',contentType:'article'}];
 const {enrichTopicImages}=await import('../src/lib/image-enrichment');await enrichTopicImages([topic]);assert.deepEqual(urls,['https://example.test/article']);
});
