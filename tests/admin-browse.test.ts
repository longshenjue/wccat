import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';

test('admin browsing pages exact stored versions, preserves source isolation and never fabricates trend values',async()=>{
 const db=await testDatabase();
 try {
  const browse=await import('../src/lib/admin-browse');
  const {exportMonth}=await import('../src/lib/archive-export');
  const {registerArchives,closeArchives}=await import('../src/lib/archive-catalog');
  const make=(hour:string,title='测试话题',heat=100)=>{
   const value=snapshot('2025-09-01-'+hour,new Date('2025-09-01T'+hour+':00:00+08:00').toISOString());
   value.topics[0].title=title;value.topics[0].heatScore=heat;return value;
  };
  db.saveSnapshotToDb(make('00'));
  db.saveSnapshotToDb(make('04','测试话题',200));
  db.saveSnapshotToDb(make('08','不同的完整标题',300));
  const blank=make('12');blank.topics=[];db.saveSnapshotToDb(blank);
  db.saveTopicAnalysisToDb('2025-09-01-00','topic-one',{...report('2025-09-01').topics[0].aiAnalysis!,model:'archived-model'});
  const input={date:'2025-09-01',snapshot:'2025-09-01-00',kind:'topics',page:'1',limit:'20'};
  const initial=browse.hourlyBrowse(input);
  assert.equal(initial.snapshots.length,4);
  assert.equal(initial.total,1);
  assert.equal(initial.items[0].title,'测试话题');
  assert.equal(browse.hourlyBrowse({...input,page:'2'}).items.length,0);
  assert.throws(()=>browse.hourlyBrowse({...input,page:'0'}),/页|参数/);
  assert.throws(()=>browse.hourlyBrowse({...input,limit:'101'}),/页|参数/);
  assert.equal(browse.hourlyBrowse({...input,date:'2025-08-31',snapshot:undefined}).snapshot,null);
  const raw=browse.hourlyBrowse({...input,kind:'raw'});
  assert.equal(raw.items[0].title,'测试话题');
  const rawDetail=browse.browseItem({snapshot:input.snapshot,version:raw.snapshot!.version,key:raw.items[0].key});
  assert.ok(rawDetail.linkedTopicKey);
  const anchor={snapshot:input.snapshot,version:initial.snapshot!.version,key:initial.items[0].key};
  const trend=browse.topicTrend({...anchor,date:input.date,days:'1'});
  assert.deepEqual(trend.points.map(p=>p.heatScore),[100,200,null,null]);
  assert.deepEqual(trend.points.map(p=>p.rank),[1,1,null,null]);
  assert.equal(trend.points[2].status,'unmatched');
  assert.throws(()=>browse.topicTrend({...anchor,date:input.date,days:'999'}),/范围|参数/);
  assert.throws(()=>browse.browseItem({...anchor,snapshot:'2025-09-01-04'}),/版本/);

  const pack=await exportMonth({start:'2025-09-01',end:'2025-09-01'},'full');
  await registerArchives([pack.path]);
  db.saveSnapshotToDb({...make('00'),generatedAt:'2025-08-31T15:59:00Z'});
  db.saveTopicAnalysisToDb('2025-09-01-00','topic-one',{...report('2025-09-01').topics[0].aiAnalysis!,model:'wrong-main-analysis'});
  const archived=browse.hourlyBrowse(input);
  assert.equal(archived.snapshot!.origin,'archive');
  const detail=browse.browseItem({...anchor,version:archived.snapshot!.version});
  assert.equal(detail.analysis?.model,'archived-model');
  db.saveSnapshotToDb({...make('00'),generatedAt:'2025-08-31T16:01:00Z'});
  assert.throws(()=>browse.browseItem({...anchor,version:archived.snapshot!.version}),/版本/);
  db.saveDailyReportToDb(report('2025-09-01'));
  assert.equal(browse.dailyBrowse('2025-09-01').report?.topics.length,1);
  assert.equal(browse.dailyBrowse('2025-08-31').report,null);
  const {normalizeTitle,topicIdFromTitle}=await import('../src/lib/normalize');
  for(const [hour,title] of [['00','某股票上涨📈'],['04','某股票上涨📉']]) {
   const sample=make(hour,title,hour==='00'?100:200);sample.date='2025-09-03-'+hour;
   sample.generatedAt=new Date('2025-09-03T'+hour+':00:00+08:00').toISOString();
   sample.topics[0].id=topicIdFromTitle(title);sample.topics[0].normalizedTitle=normalizeTitle(title);
   db.saveSnapshotToDb(sample);
  }
  const symbolic=browse.hourlyBrowse({date:'2025-09-03',snapshot:'2025-09-03-00'});
  assert.deepEqual(browse.topicTrend({snapshot:symbolic.snapshot!.date,version:symbolic.snapshot!.version,key:symbolic.items[0].key,date:'2025-09-03',days:'1'}).points.map(point=>point.heatScore),[100,null]);
  assert.throws(()=>browse.hourlyBrowse({...input,version:archived.snapshot!.version,page:'2'}),/版本/);
  for(let month=1;month<=6;month++) {
   const day='2024-'+String(month).padStart(2,'0')+'-01';
   db.saveSnapshotToDb(snapshot(day+'-08'));
   const archive=await exportMonth({start:day,end:day},'full');await registerArchives([archive.path]);
  }
  assert.equal(browse.hourlyBrowse(input).total,1);
  const latest=browse.hourlyBrowse(input);
  assert.equal(browse.topicTrend({...anchor,key:latest.items[0].key,version:latest.snapshot!.version,date:input.date,days:'30'}).points.length,4);
  closeArchives();
 } finally {db.close();}
});
