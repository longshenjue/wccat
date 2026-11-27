import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from './helpers/data-fixtures';

test('public daily data keeps reader material but never serializes private reporting bodies or warnings',async()=>{
 const {publicDailyReport}=await import('../src/lib/newsroom/public-daily-report');
 const daily=report('2026-11-27');
 daily.topics[0].research={policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:'ready',queries:[],questions:['PRIVATE QUERY'],warnings:['PRIVATE FAILURE'],documents:[{id:'r-private',title:'Current report',url:'https://news.qq.com/rain/a/20261127A0BGAN00',publisher:'腾讯新闻',text:'PRIVATE SCRAPED BODY',retrievedAt:'2026-11-27T09:00:00Z',purpose:'event'}]};
 daily.topics[0].assetWarnings=['PRIVATE ASSET WARNING'];
 daily.topics[0].relatedDevelopments=[structuredClone(daily.topics[0])];
 const original=JSON.stringify(daily),result=publicDailyReport(daily),json=JSON.stringify(result);
 assert.doesNotMatch(json,/PRIVATE/);assert.equal(JSON.stringify(daily),original);assert.equal(result.topics[0].title,daily.topics[0].title);
});
