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
 const analysis={summary:'分析摘要',detailedContent:'完整分析',outsiderContext:'背景说明',battle:{redLabel:'质疑',blueLabel:'支持',redScore:40,blueScore:60,redRationale:'红方依据',blueRationale:'蓝方依据'},platformAnalyses:[{sourceId:'weibo',sourceName:'微博',attitude:'观点',evidence:'依据',stance:'neutral' as const,confidence:80}],model:'test'};
 return {reportDate:date,generatedAt,windowStart:date+'-00',windowEnd:date+'-23',headline:'日报',overview:'总览',topics:[{id:'topic-one',rank:1,title:'话题',dailyScore:100,peakRank:1,peakHeatScore:100,activeHours:1,sources:['微博'],categories:['social'],sentiment:'neutral',signal:'rising',oneLine:'摘要',whyItMatters:'背景',aiAnalysis:analysis,analysisSnapshotDate:date+'-08',links:[{sourceId:'weibo',sourceName:'微博',title:'话题',url:'https://example.test/story'}]}],wechatDraft:'中文稿件',videoScript:'视频稿件',model:'test',shareEnglish:{headline:'Daily',overview:'Overview',topics:[{id:'topic-one',title:'Topic',oneLine:'Summary',whyItMatters:'Context',sources:['Weibo']}],analysis:{summary:'Summary',detailedContent:'Full analysis',outsiderContext:'Background',battle:{redLabel:'Doubt',blueLabel:'Support',redRationale:'Red evidence',blueRationale:'Blue evidence'},platformAnalyses:[{sourceId:'weibo',sourceName:'Weibo',attitude:'Attitude',evidence:'Evidence'}]}}};
}

