import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import type {DailySnapshot} from '../../src/lib/types';
import type {WccatDailyReport} from '../../src/lib/daily-report';
export async function testDatabase(){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'wccat-data-test-')));
 process.env.WCCAT_DATA_DIR=dir;
 const db=await import('../../src/lib/db');
 assert.equal(db.getDb().name,join(dir,'wccat.sqlite'));
 return {...db,dir,close(){db.getDb().close();rmSync(dir,{recursive:true,force:true});}};
}
export function snapshot(date:string,generatedAt=date.slice(0,10)+'T00:00:00Z'):DailySnapshot{
 const raw={sourceId:'weibo',sourceName:'微博',sourceKind:'public' as const,sourceCategory:'social' as const,rank:1,title:'测试话题',url:'https://example.test/story',fetchedAt:generatedAt};
 return {date,generatedAt,sources:[],rawItems:[raw],topics:[{id:'topic-one',title:raw.title,normalizedTitle:raw.title,rank:1,heatScore:100,sources:['微博'],sourceKinds:['public'],categories:['social'],occurrences:[{...raw,normalizedTitle:raw.title,platformScore:100}],signal:'steady',sentiment:'neutral',officialPublicResonance:false,summary:{oneLine:'摘要',whyItMatters:'原因',context:'背景',emotion:'中性'}}],digest:{date,generatedAt,headline:'测试小时榜',overview:'总览',dominantSentiments:['neutral'],officialFocus:[],publicFocus:[],resonanceTopics:[]}};
}
export function report(date:string,generatedAt=date+'T00:10:00Z'):WccatDailyReport{
 return {reportDate:date,generatedAt,windowStart:date+'-00',windowEnd:date+'-23',headline:'日报',overview:'总览',topics:[],wechatDraft:'中文稿件',videoScript:'视频稿件',model:'test',shareEnglish:{headline:'Daily',overview:'Overview',topics:[]}};
}

