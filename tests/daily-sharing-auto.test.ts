import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';
import {shareEnDraft} from './helpers/shareen-fixture';

test('daily generation automatically saves ShareEn and original Top3 branded captions',async()=>{
 const db=await testDatabase(),previousKey=process.env.DEEPSEEK_API_KEY,previousFetch=globalThis.fetch;
 process.env.DEEPSEEK_API_KEY='test-auto-sharing-key';
 try{
  const sample=snapshot('2025-11-13-12','2025-11-13T04:00:00Z');
  sample.topics=Array.from({length:3},(_,index)=>{const topic=structuredClone(sample.topics[0]);topic.id='story-'+index;topic.title='测试故事'+index;topic.normalizedTitle=topic.title;topic.rank=index+1;topic.heatScore=100-index;topic.occurrences[0].title=topic.title;topic.occurrences[0].normalizedTitle=topic.title;return topic;});
  db.saveSnapshotToDb(sample);
  for(const topic of sample.topics)db.saveTopicAnalysisToDb(sample.date,topic.id,report('2025-11-13').topics[0].aiAnalysis!);
  const phases:string[]=[];
  globalThis.fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   if(body.max_tokens===6500){phases.push('shareen');return Response.json({choices:[{message:{content:JSON.stringify(shareEnDraft(JSON.parse(body.messages[1].content)))}}]});}
   if(body.max_tokens===12000){
    phases.push('english');const source=JSON.parse(body.messages[1].content);
    function convert(value:unknown,key=''):unknown{if(typeof value==='string')return key==='id'||key==='sourceId'?value:value.replace(/\p{Script=Han}+/gu,'English');if(Array.isArray(value))return value.map(item=>convert(item));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v,k)]));return value;}
    return Response.json({choices:[{message:{content:JSON.stringify(convert(source))}}]});
   }
   phases.push('chinese');return Response.json({choices:[{message:{content:JSON.stringify({headline:'中文日报',overview:'总览',wechatDraft:'公众号稿件',videoScript:'视频稿件'})}}]});
  };
  const {generateDailyReport}=await import('../src/lib/daily-report');
  const daily=await generateDailyReport(new Date('2025-11-14T02:00:00+08:00'));
  assert.deepEqual(phases,['chinese','english','shareen']);
  assert.equal(daily.reportDate,'2025-11-13');assert.ok(daily.shareEnglish);assert.ok(daily.shareEn);
  const saved=db.readDailyReportFromDb('2025-11-13')!;
  assert.equal(saved.shareEn?.highlights.length,3);assert.equal(saved.headline,'中文日报');
  const text=saved.shareEn!.posts[0].text;
  assert.match(text,/^WcCAT Daily Hot/);
  for(let index=0;index<3;index++)assert.ok(text.includes(['1️⃣','2️⃣','3️⃣'][index]+' '+saved.shareEn!.top3[index].summary));
  assert.deepEqual(saved.shareEn!.top3.map(row=>row.topicId),saved.topics.slice(0,3).map(topic=>topic.id));
  const normalFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(String(init?.body));
   if(body.max_tokens===12000){
    const current=db.readDailyReportFromDb('2025-11-13')!;
    const newer={...saved.shareEnglish!,headline:'Newer admin English'};
    db.saveDailyReportToDb({...current,shareEnglish:newer});
    return Response.json({choices:[{message:{content:JSON.stringify({...saved.shareEnglish!,headline:'Older delayed daily English'})}}]});
   }
   return normalFetch(url,init);
  };
  await assert.rejects(()=>generateDailyReport(new Date('2025-11-14T02:00:00+08:00')),/英文保存失败/);
  assert.equal(db.readDailyReportFromDb('2025-11-13')?.shareEnglish?.headline,'Newer admin English');
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;db.close();}
});
