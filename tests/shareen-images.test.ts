import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {report as fixture,snapshot,testDatabase} from './helpers/data-fixtures';
import {savedShareEnFixture,shareEnDraft} from './helpers/shareen-fixture';
import type {ShareEnImageAsset} from '../src/lib/shareen-image-types';

test('persisted ShareEn images across generation, admin routes, edits and archives',async t=>{
 const db=await testDatabase();
 const oldFetch=globalThis.fetch;
 const env={DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,WCCAT_ADMIN_PASSWORD_HASH:process.env.WCCAT_ADMIN_PASSWORD_HASH,WCCAT_ADMIN_SESSION_SECRET:process.env.WCCAT_ADMIN_SESSION_SECRET};
 try{
  const {generateSharing,saveShareEnEdits}=await import('../src/lib/sharing');
  const {shareEnRevision}=await import('../src/lib/shareen');
  const auth=await import('../src/lib/admin-auth');
  process.env.DEEPSEEK_API_KEY='image-fixture-api-key-9b6d';
  process.env.WCCAT_ADMIN_PASSWORD_HASH=auth.hashAdminPassword('image-test-admin-password');
  process.env.WCCAT_ADMIN_SESSION_SECRET='image-test-secret-over-thirty-two-characters';
  const route=await import('../src/app/api/admin/share/route');
  const browse=await import('../src/app/api/admin/browse/route');
  const cookie='wccat_admin='+auth.createAdminSession();
  const base='https://example.test';
  const report=fixture('2025-09-04');
  report.topics=[1,2,3,4].map(n=>({...report.topics[0],id:'topic-'+n,rank:n,title:'新闻'+n,cover:'https://i0.hdslb.com/'+n+'.png'}));
  delete report.shareEnglish;
  report.shareEn=await savedShareEnFixture(report);
  report.shareEn.highlights[2].hideImage=true;
  const query='date='+report.reportDate;
  const request=(path:string)=>new Request(base+path,{headers:{cookie}});
  const post=(body:Record<string,unknown>)=>route.POST(new Request(base+'/api/admin/share',{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({date:report.reportDate,...body})}));
  const hash=(buffer:Buffer)=>createHash('sha256').update(buffer).digest('hex');
  const png=await sharp({create:{width:60,height:100,channels:3,background:'red'}}).png().toBuffer();
  const calls:string[]=[];
  const fetchImages:typeof fetch=async(url,init)=>{
   if(!init?.body){calls.push(String(url));return new Response(new Uint8Array(png),{headers:{'content-type':'image/png'}});}
   const body=JSON.parse(String(init.body));
   if(body.max_tokens===6500){calls.push('text');return Response.json({choices:[{message:{content:JSON.stringify(shareEnDraft(report))}}]});}
   calls.push('vision');return Response.json({choices:[{message:{content:JSON.stringify({mode:'split',protectedRegions:[],focalPoint:{x:.5,y:.5},confidence:.4,reason:'portrait'})}}]});
  };
  const noNetwork=()=>{calls.push('unexpected');throw new Error('Network disabled');};
  globalThis.fetch=fetchImages;
  db.saveDailyReportToDb(report);
  await t.test('images-only processes visible selected topics sequentially and caches without fetching',async()=>{
   const {report:saved}=await generateSharing(report.reportDate,{format:'images'});
   assert.deepEqual(calls,[report.topics[0].cover,'vision',report.topics[1].cover,'vision']);
   assert.ok(saved.shareEn?.highlights[0].imageAsset?.dataBase64);
   assert.equal(saved.shareEn?.highlights[2].imageAsset,undefined);
   const second=saved.shareEn!.highlights[1].imageAsset;
   calls.length=0;
   await generateSharing(report.reportDate,{format:'shareen'});
   assert.deepEqual(calls,[]);
   await generateSharing(report.reportDate,{format:'images',topicId:'topic-1',force:true});
   assert.deepEqual(calls,[report.topics[0].cover,'vision']);
   assert.deepEqual(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[1].imageAsset,second);
  });
  // Independent persisted asset for boundary tests, even if the generation test fails.
  const webp=await sharp(png).resize(400,480).webp().toBuffer();
  const first:ShareEnImageAsset={version:1,id:hash(webp),requestKey:'b'.repeat(64),sourceHash:hash(png),sourceUrl:report.topics[0].cover!,model:'fixture',policyVersion:'v1',layout:'split',width:400,height:480,sourceWidth:60,sourceHeight:100,protectedRegions:[],confidence:0,reason:'full image',processedAt:report.generatedAt,mime:'image/webp',dataBase64:webp.toString('base64')};
  const original=structuredClone(report);
  original.shareEn!.highlights[0].imageAsset=first;
  const reset=()=>{db.saveDailyReportToDb(original);calls.length=0;globalThis.fetch=noNetwork;};
  await t.test('both admin JSON reads and edit responses redact bytes, server restores omitted hidden assets',async()=>{
   reset();
   const payload=await (await route.GET(request('/api/admin/share?'+query))).json();
   assert.doesNotMatch(JSON.stringify(payload),/dataBase64/);
   assert.doesNotMatch(await (await browse.GET(request('/api/admin/browse?view=daily&'+query))).text(),/dataBase64/);
   delete payload.report.shareEn.highlights[0].imageAsset;
   payload.report.shareEn.highlights[0].hideImage=true;
   const response=await post({action:'save',copy:payload.report.shareEn,expectedRevision:payload.shareEnRevision});
   assert.equal(response.status,200);
   assert.doesNotMatch(await response.text(),/dataBase64/);
   assert.deepEqual(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].imageAsset,first);
   assert.deepEqual(calls,[]);
  });
  await t.test('invalid legacy image caches disappear from the projected editor while the raw revision still protects unrelated text edits',async()=>{
   const legacy=await import('../src/app/api/admin/db/route');
   for(const corrupt of [{version:2,id:'legacy'},{...first,dataBase64:'!invalid'},{...first,dataBase64:'AAAA'}]){
    reset();
    const archived=structuredClone(original);
    archived.shareEn!.highlights[0].imageAsset=corrupt as ShareEnImageAsset;
    db.saveDailyReportToDb(archived);
    const editor=await (await route.GET(request('/api/admin/share?'+query))).json();
    assert.equal(editor.shareEnRevision,shareEnRevision(archived.shareEn));
    assert.equal(editor.report.shareEn.highlights[0].imageAsset,undefined);
    const daily=await (await browse.GET(request('/api/admin/browse?view=daily&'+query))).json();
    assert.equal(daily.report.shareEn.highlights[0].imageAsset,undefined);
    const rows=(await (await legacy.GET(request('/api/admin/db?table=daily_reports'))).json()).rows;
    assert.equal(JSON.parse(rows[0].payload).shareEn.highlights[0].imageAsset,undefined);
    const save=()=>post({action:'save',copy:editor.report.shareEn,expectedRevision:editor.shareEnRevision});
    editor.report.shareEn.highlights[0].hook='A fresh headline';
    assert.equal((await save()).status,200);
    assert.equal(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].hook,'A fresh headline');
    assert.equal((await save()).status,409);
    assert.deepEqual(calls,[]);
   }
  });
  await t.test('edits cannot introduce cached bytes or copy an asset to a different topic; URL replacement clears previous',()=>{
   reset();
   const revision=shareEnRevision(original.shareEn);
   const copy=structuredClone(original.shareEn!);
   copy.highlights[1].imageAsset=first;
   assert.throws(()=>saveShareEnEdits(report.reportDate,copy,revision));
   delete copy.highlights[1].imageAsset;
   copy.highlights[0].imageAsset={...first,dataBase64:'AAAA'};
   assert.throws(()=>saveShareEnEdits(report.reportDate,copy,revision));
   copy.highlights[0].imageAsset=first;
   copy.highlights[0].imageUrl='https://i0.hdslb.com/replacement.png';
   const changed=saveShareEnEdits(report.reportDate,copy,revision);
   assert.equal(changed.shareEn!.highlights[0].imageAsset,undefined);
   assert.deepEqual(calls,[]);
  });
  await t.test('source failure retains same-topic previous; text-force reuses image cache',async()=>{
   reset();globalThis.fetch=fetchImages;
   const edited=structuredClone(original);
   edited.shareEn!.highlights[0].imageUrl='https://i0.hdslb.com/override.png';
   db.saveDailyReportToDb(edited);
   const full=await generateSharing(report.reportDate,{format:'images'});
   const previous=full.report.shareEn!.highlights[0].imageAsset;
   calls.length=0;globalThis.fetch=noNetwork;
   const failed=await generateSharing(report.reportDate,{format:'images',force:true,topicId:'topic-1'});
   assert.deepEqual(failed.report.shareEn!.highlights[0].imageAsset,previous);
   assert.deepEqual(calls,['unexpected']);
   calls.length=0;globalThis.fetch=fetchImages;
   const refreshed=await generateSharing(report.reportDate,{format:'shareen',force:true});
   assert.deepEqual(refreshed.report.shareEn!.highlights[0].imageAsset,previous);
   assert.equal(refreshed.report.shareEn!.highlights[0].imageUrl,'https://i0.hdslb.com/override.png');
   assert.equal(refreshed.report.shareEn!.highlights[2].hideImage,true);
   assert.deepEqual(calls,['text']);
  });
  await t.test('image result cannot overwrite a Chinese, ShareEn or maintenance revision changed during fetch',async()=>{
   for(const race of ['source','target','maintenance']){
    reset();
    globalThis.fetch=async(url,init)=>{
     if(!init?.body){
      const updated=structuredClone(original);
      if(race==='source')updated.headline='新版日报';
      if(race==='target')updated.shareEn!.highlights[0].hideImage=true;
      if(race==='maintenance')db.getDb().prepare('update maintenance_state set generation=generation+1 where id=1').run();
      else db.saveDailyReportToDb(updated);
     }
     return fetchImages(url,init);
    };
    await assert.rejects(generateSharing(report.reportDate,{format:'images',force:true,topicId:'topic-1'}),/changed|已改变/);
    assert.deepEqual(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].imageAsset,first);
   }
  });
  await t.test('the image stage keeps the committed text revision even if an editor saves before image work starts',async()=>{
   reset();globalThis.fetch=fetchImages;
   await assert.rejects(generateSharing(report.reportDate,{
    format:'shareen',force:true,
    log:(_level,message)=>{
     if(message==='ShareEn 文案已保存'){
      const newer=db.readDailyReportFromDb(report.reportDate)!;
      newer.shareEn!.highlights[0].hook='Concurrent editor hook';
      db.saveDailyReportToDb(newer);
     }
    }
   }),/changed/);
   const latest=db.readDailyReportFromDb(report.reportDate)!;
   assert.equal(latest.shareEn?.highlights[0].hook,'Concurrent editor hook');
   assert.deepEqual(latest.shareEn?.highlights[0].imageAsset,first);
  });
  await t.test('a failed refresh retaining the same image still detects concurrent edits',async()=>{
   reset();
   globalThis.fetch=async()=>{
    const newer=structuredClone(original);
    newer.shareEn!.highlights[0].hook='An edited hook';
    db.saveDailyReportToDb(newer);
    throw new Error('Offline');
   };
   await assert.rejects(generateSharing(report.reportDate,{format:'images',force:true,topicId:'topic-1'}),/changed/);
   assert.equal(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].hook,'An edited hook');
  });
  await t.test('supplementing replaces a cache whose hash is correct but whose persisted WebP dimensions are wrong',async()=>{
   reset();globalThis.fetch=fetchImages;
   const generated=(await generateSharing(report.reportDate,{format:'images'})).report;
   const asset=generated.shareEn!.highlights[0].imageAsset!;
   const wrongSize=await sharp(png).webp().toBuffer();
   asset.dataBase64=wrongSize.toString('base64');asset.id=hash(wrongSize);
   db.saveDailyReportToDb(generated);
   calls.length=0;
   const restored=(await generateSharing(report.reportDate,{format:'images',topicId:'topic-1'})).report.shareEn!.highlights[0].imageAsset!;
   assert.notEqual(restored.id,asset.id);
   assert.deepEqual(calls,[report.topics[0].cover,'vision']);
  });
  await t.test('image job validates scope and can complete despite missing ordinary English',async()=>{
   reset();
   const offline=structuredClone(original);
   for(const topic of offline.topics)delete topic.cover;
   offline.shareEn=await savedShareEnFixture(offline);
   db.saveDailyReportToDb(offline);
   process.env.DEEPSEEK_API_KEY='';
   for(const [format,topicId] of [['images','topic-4'],['images',''],['shareen','topic-1']])assert.equal((await post({action:'generate',format,topicId})).status,400);
   // The spawned worker has no remote sources or model credentials.
   const queued=await post({action:'generate',format:'images',topicId:'topic-3',force:true});
   assert.equal(queued.status,202);
   const {job}=await queued.json();
   assert.equal(job.input.topicId,'topic-3');
   const {getJob,runJob}=await import('../src/lib/admin-jobs');
   let done=getJob(job.id);
   for(let i=0;i<200&&['queued','running'].includes(done.status);i++){await new Promise(r=>setTimeout(r,30));done=getJob(job.id);}
   assert.ok(!['queued','running'].includes(done.status));
   process.env.DEEPSEEK_API_KEY='image-fixture-api-key-9b6d';
   reset();globalThis.fetch=fetchImages;
   const id=randomUUID(),now=Date.now();
   db.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'sharing','queued',?,?,?)").run(id,JSON.stringify({kind:'sharing',reportDate:report.reportDate,shareFormat:'images',topicId:'topic-1',force:true}),now,now);
   const result=await runJob(id);
   assert.equal(result.status,'complete',result.error??undefined);
   assert.equal(result.result.sharing?.englishReady,false);
   assert.equal(result.result.sharing?.imagesReady,true,'the selected photo is available for authenticated downloads');
   assert.deepEqual(calls,[report.topics[0].cover,'vision']);
  });
  await t.test('development database editor roundtrips public metadata and only hydrates same-topic, unchanged-source assets',async()=>{
   reset();
   const legacy=await import('../src/app/api/admin/db/route');
   const list=(await (await legacy.GET(request('/api/admin/db?table=daily_reports'))).json()).rows as Array<{report_date:string;payload:string}>;
   const row=list.find(row=>row.report_date===report.reportDate)!;
   assert.equal(row.payload.includes('dataBase64'),false);
   const edited=JSON.parse(row.payload) as typeof report;
   edited.shareEn!.highlights[0].hideImage=true;
   const mutation=(method:string,body:unknown)=>new Request(base+'/api/admin/db',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const patch=()=>legacy.PATCH(mutation('PATCH',{table:'daily_reports',key:{report_date:report.reportDate},values:{payload:JSON.stringify(edited)}}));
   assert.equal((await patch()).status,200);
   assert.deepEqual(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].imageAsset,first);
   edited.shareEn!.highlights[1].imageAsset=edited.shareEn!.highlights[0].imageAsset;
   assert.equal((await patch()).status,400);
   delete edited.shareEn!.highlights[1].imageAsset;
   edited.shareEn!.highlights[0].imageAsset!.dataBase64='AAAA';
   assert.equal((await patch()).status,400);
   assert.deepEqual(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].imageAsset,first);
   delete edited.shareEn!.highlights[0].imageAsset!.dataBase64;
   edited.topics[0].cover='https://i0.hdslb.com/legacy-edited.png';
   assert.equal((await patch()).status,200);
   assert.equal(db.readDailyReportFromDb(report.reportDate)?.shareEn?.highlights[0].imageAsset,undefined);
   const create=(payload:typeof original)=>legacy.POST(mutation('POST',{table:'daily_reports',values:{report_date:'2025-09-05',generated_at:original.generatedAt,model:'fixture',payload}}));
   assert.equal((await create(original)).status,400);
   assert.equal((await create(edited)).status,400,'a new row cannot claim another row’s asset metadata');
   delete edited.shareEn!.highlights[0].imageAsset;
   assert.equal((await create(edited)).status,200);
   db.getDb().prepare("delete from daily_reports where report_date='2025-09-05'").run();
   assert.deepEqual(calls,[]);
  });
  await t.test('cleanup coverage projects scalar windows from image-heavy and malformed historical reports',async t=>{
   reset();
   db.saveSnapshotToDb(snapshot('2025-08-01-08'));
   db.saveSnapshotToDb(snapshot('2025-08-02-08'));
   const database=db.getDb();
   const insert=database.prepare("insert into daily_reports(report_date,generated_at,model,payload) values(?,?,'fixture',?)");
   const heavy=JSON.stringify({windowStart:'2025-08-01-00',windowEnd:'2025-08-01-23',archiveMarker:'heavy-historical-payload',dataBase64:'A'.repeat(512*1024)});
   insert.run('2025-10-01',original.generatedAt,heavy);
   insert.run('2025-10-02',original.generatedAt,'broken json');
   insert.run('2025-10-03',original.generatedAt,JSON.stringify({windowStart:{wrong:'type'},windowEnd:12}));
   try{
    const {previewCleanup}=await import('../src/lib/data-preview');
    // Observe whether full out-of-range photos cross into JS while calculating date coverage.
    const parse=JSON.parse;
    const materialized:string[]=[];
    const probe=t.mock.method(JSON,'parse',(...args:Parameters<typeof JSON.parse>)=>{
     if(typeof args[0]==='string'&&args[0].includes('heavy-historical-payload'))materialized.push('full photo');
     return parse(...args);
    });
    const preview=previewCleanup(database,{start:'2025-08-01',end:'2025-08-01'},Date.parse('2025-12-01T12:00:00Z'));
    probe.mock.restore();
    assert.deepEqual(preview.daysWithoutReports,[]);
    assert.equal(preview.dailyKept,4);
    assert.deepEqual(materialized,[]);
   }finally{database.prepare("delete from daily_reports where report_date between '2025-10-01' and '2025-10-03'").run();}
  });
  await t.test('authenticated image GET verifies exact dimensions and hash, works after archive/register, no network',async()=>{
   reset();
   const {GET}=await import('../src/app/api/admin/share/image/route');
   const path='/api/admin/share/image?'+query+'&topicId=topic-1&assetId=';
   assert.equal((await GET(new Request(base+path+first.id))).status,401);
   assert.equal((await GET(request(path+'a'.repeat(64)))).status,404);
   const stale=structuredClone(original);
   stale.shareEn!.highlights[0].imageUrl='https://i0.hdslb.com/edited.png';
   db.saveDailyReportToDb(stale);
   assert.equal((await GET(request(path+first.id))).status,404,'stale source in archive cannot serve a previously registered id');
   for(const bad of [{...first,dataBase64:'AAAA'}, {...first,id:hash(png),dataBase64:png.toString('base64')}]){
    const copy=structuredClone(original);
    copy.shareEn!.highlights[0].imageAsset=bad;db.saveDailyReportToDb(copy);
    assert.equal((await GET(request(path+bad.id))).status,404);
   }
   const wrongSize=await sharp(png).webp().toBuffer();
   const copy=structuredClone(original);
   copy.shareEn!.highlights[0].imageAsset={...first,id:hash(wrongSize),dataBase64:wrongSize.toString('base64')};
   db.saveDailyReportToDb(copy);
   assert.equal((await GET(request(path+hash(wrongSize)))).status,404);
   reset();
   const {exportMonth}=await import('../src/lib/archive-export');
   const {registerArchives,closeArchives}=await import('../src/lib/archive-catalog');
   const pack=await exportMonth({start:'2025-09-01',end:'2025-09-30'},'daily');
   await registerArchives([pack.path]);
   db.getDb().prepare('delete from daily_reports where report_date=?').run(report.reportDate);
   const response=await GET(request(path+first.id));
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'image/webp');
   assert.match(response.headers.get('cache-control')??'',/private/);
   assert.match(response.headers.get('vary')??'',/cookie/i);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),webp);
   assert.deepEqual(calls,[]);
   closeArchives();
  });
 }finally{
  globalThis.fetch=oldFetch;
  for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  db.close();
 }
});
