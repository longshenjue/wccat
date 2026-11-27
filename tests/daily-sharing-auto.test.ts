import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';
import sharp from 'sharp';
import {shareEnDraft} from './helpers/shareen-fixture';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ShareEnPoster} from '../src/components/shareen-poster';
import {shareEnTextFiles} from '../src/lib/share-export';

test('daily generation saves aligned focus captions and repaired emotional strips for preview and export',async()=>{
 const db=await testDatabase(),previousKey=process.env.DEEPSEEK_API_KEY,previousFetch=globalThis.fetch;
 process.env.DEEPSEEK_API_KEY='test-auto-sharing-key';
 try{
  const sample=snapshot('2025-11-13-12','2025-11-13T04:00:00Z');
  sample.topics=Array.from({length:4},(_,index)=>{const topic=structuredClone(sample.topics[0]);topic.id='story-'+index;topic.title='测试故事'+index;topic.normalizedTitle=topic.title;topic.rank=index+1;topic.heatScore=100-index;topic.occurrences[0].title=topic.title;topic.occurrences[0].normalizedTitle=topic.title;topic.occurrences[0].rank=index+1;topic.occurrences.push({...topic.occurrences[0],sourceId:'baidu',sourceName:'百度热搜',sourceCategory:'search',url:`https://example.test/baidu/${index}`});topic.sources=['微博','百度热搜'];return topic;});
  sample.rawItems=sample.topics.flatMap(topic=>topic.occurrences);
  sample.topics[0].occurrences[0].cover='https://i0.hdslb.com/daily.png';
  sample.topics[3].occurrences[0].cover='https://i0.hdslb.com/new-topic.png';
  const png=await sharp({create:{width:20,height:30,channels:3,background:'red'}}).png().toBuffer();
  db.saveSnapshotToDb(sample);
  for(const topic of sample.topics)db.saveTopicAnalysisToDb(sample.date,topic.id,report('2025-11-13').topics[0].aiAnalysis!);
  const phases:string[]=[],photoUrls:string[]=[];
  let reselect=false;
  globalThis.fetch=async(_url,init)=>{
   if(!init?.body){phases.push('photo');photoUrls.push(String(_url));return new Response(new Uint8Array(png),{headers:{'content-type':'image/png'}});}
   const body=JSON.parse(String(init.body));
   if(body.max_tokens===2200){phases.push('editorial');return Response.json({choices:[{message:{content:'{"groups":[]}'}}]});}
   if(body.max_tokens===1600){phases.push('vision');return new Response('',{status:503});}
   if(body.max_tokens===6500){
    const request=JSON.parse(body.messages[1].content);
    if(request.repairs){
     phases.push('shareen-repair');
     const battle={redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want a clear explanation.',blueRationale:'Others want to verify the report.',redScore:80,blueScore:20};
     return Response.json({choices:[{message:{content:JSON.stringify({topics:Object.fromEntries(request.repairs.filter((r:{field:string})=>r.field==='battle').map((r:{topicId:string})=>[r.topicId,{battle}]))})}}]});
    }
    phases.push('shareen');
    const source=request,draft=shareEnDraft(source,{omitBattle:true});
    if(reselect)draft.highlights=[draft.highlights[1],{...draft.highlights[2],topicId:source.topics[3].id},draft.highlights[0]];
    return Response.json({choices:[{message:{content:JSON.stringify(draft)}}]});
   }
   if(body.max_tokens===12000){
    phases.push('english');const source=JSON.parse(body.messages[1].content);
    function convert(value:unknown,key=''):unknown{if(typeof value==='string')return key==='id'||key==='sourceId'?value:value.replace(/\p{Script=Han}+/gu,'English');if(Array.isArray(value))return value.map(item=>convert(item));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v,k)]));return value;}
    return Response.json({choices:[{message:{content:JSON.stringify(convert(source))}}]});
   }
   phases.push('chinese');return Response.json({choices:[{message:{content:JSON.stringify({headline:'中文日报',overview:'总览',wechatDraft:'公众号稿件',videoScript:'视频稿件'})}}]});
  };
  const {generateDailyReport}=await import('../src/lib/daily-report');
  const daily=await generateDailyReport(new Date('2025-11-14T02:00:00+08:00'));
  assert.deepEqual(phases,['editorial','chinese','english','shareen','shareen-repair','photo','vision']);
  assert.equal(daily.storySelection?.mode,'semantic');
  assert.equal(daily.reportDate,'2025-11-13');assert.ok(daily.shareEnglish);assert.ok(daily.shareEn);
  const saved=db.readDailyReportFromDb('2025-11-13')!;
  assert.equal(saved.shareEn?.highlights.length,3);assert.equal(saved.headline,'中文日报');
  assert.ok(saved.shareEn?.highlights[0].imageAsset?.dataBase64);
  assert.equal(saved.shareEn!.captionBasis,'highlights');
  assert.ok(saved.shareEn!.highlights.every(h=>h.battle?.basis==='analysis'));
  const rendered=saved.shareEn!.highlights.map((_,i)=>renderToStaticMarkup(createElement(ShareEnPoster,{report:saved,copy:saved.shareEn!,index:i+1}))).join('');
  assert.equal((rendered.match(/aria-label="Emotional opposition"/g)??[]).length,3);
  const exportedAlt=new TextDecoder().decode(shareEnTextFiles(saved,saved.shareEn!).find(f=>f.name==='alt-text.txt')!.data);
  assert.equal((exportedAlt.match(/Debate energy/g)??[]).length,3);
  const text=saved.shareEn!.posts[0].text;
  assert.equal(saved.shareEn!.layout,'editorial');
  assert.match(text,/^Science meets culture\./);
  assert.match(text,/\nWcCAT:[^\n]*sources & context in the reply\.$/);
  assert.doesNotMatch(text,/sources\.txt/);
  for(let index=0;index<3;index++)assert.ok(text.includes(['1️⃣','2️⃣','3️⃣'][index]+' '+saved.shareEn!.top3[index].summary));
  assert.deepEqual(saved.shareEn!.top3.map(row=>row.topicId),saved.topics.slice(0,3).map(topic=>topic.id));
  const [hidden,replaced,dropped]=saved.shareEn!.highlights;
  hidden.hideImage=true;
  replaced.imageUrl='https://i0.hdslb.com/editor-choice.png';
  dropped.hideImage=true;dropped.imageUrl='https://i0.hdslb.com/not-for-the-next-topic.png';
  db.saveDailyReportToDb(saved);
  const {generateSharing}=await import('../src/lib/sharing');
  const replacement=(await generateSharing(saved.reportDate,{format:'images',topicId:replaced.topicId})).report.shareEn!.highlights[1].imageAsset!;
  assert.equal(replacement.sourceUrl,replaced.imageUrl);
  reselect=true;phases.length=0;photoUrls.length=0;
  const repeated=await generateDailyReport(new Date('2025-11-14T02:00:00+08:00'));
  const [kept,newSelection,stillHidden]=repeated.shareEn!.highlights;
  assert.deepEqual(repeated.shareEn!.top3.map(row=>row.topicId),repeated.shareEn!.highlights.map(row=>row.topicId));
  assert.ok(repeated.shareEn!.highlights.every(h=>h.battle));
  assert.equal(stillHidden.topicId,hidden.topicId);assert.equal(stillHidden.hideImage,true);
  assert.equal(kept.topicId,replaced.topicId);assert.equal(kept.imageUrl,replaced.imageUrl);
  assert.deepEqual(kept.imageAsset,replacement);
  assert.equal(newSelection.topicId,repeated.topics[3].id);assert.equal(newSelection.hideImage,undefined);assert.equal(newSelection.imageUrl,undefined);
  assert.deepEqual(photoUrls,['https://i0.hdslb.com/new-topic.png']);
  assert.equal(phases.filter(phase=>phase==='vision').length,1);
  const {sourceFingerprint}=await import('../src/lib/shareen');
  assert.equal(repeated.shareEn!.sourceFingerprint,sourceFingerprint(repeated));
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
