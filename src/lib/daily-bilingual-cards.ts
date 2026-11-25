import type {DailyReportTopic,WccatDailyReport} from './daily-report';
import type {ShareLanguage} from './daily-share-copy';
import type {ShareEnBattle,ShareEnCopy} from './shareen-types';
import {getShareEnBattle} from './shareen-battle';
import {topicEvidenceTexts} from './topic-sharing/evidence';

/** Server-computed transport identity; imported or saved values are never authoritative. */
export type DailyCardSource=WccatDailyReport&{sharingSourceFingerprint?:string};

/** Source excerpts are bounded for the fixed card canvas; never rewrite or add facts. */
export function nativeCardExcerpt(value:string|undefined,limit:number):string {
 const text=(value??'').trim().replace(/\s+/gu,' '),characters=Array.from(text);
 return characters.length>limit?characters.slice(0,limit).join('').trimEnd()+'…':text;
}

/** The caller supplies the frozen report that owns the English draft, including unsaved edits. */
export function assertDailyCardSource(report:DailyCardSource,copy:ShareEnCopy):void {
 const topics=report.topics.slice(0,10);
 if(report.shareEn&&report.shareEn.sourceFingerprint!==copy.sourceFingerprint)throw new Error('中文卡片与英文稿的日报版本不一致，请载入同一版本后重试。');
 if(report.sharingSourceFingerprint&&report.sharingSourceFingerprint!==copy.sourceFingerprint)throw new Error('中文卡片与英文稿的日报版本不一致，请重新生成英文分享后重试。');
 if(copy.overview.topics.length!==topics.length||copy.overview.topics.some((topic,index)=>topic.id!==topics[index].id))throw new Error('中文卡片与英文总览的话题来源或顺序不一致，请重新载入分享稿。');
 const ids=copy.highlights.map(item=>item.topicId);
 if(new Set(ids).size!==ids.length||ids.some(id=>!topics.some(topic=>topic.id===id)))throw new Error('中文卡片无法对应英文精选话题，请重新载入同一日报的分享稿。');
 for(const id of ids){
  const topic=topics.find(topic=>topic.id===id)!;
  if(!topic.title?.trim()||!topicEvidenceTexts({title:topic.title,summary:topic.oneLine,context:topic.whyItMatters,analysis:topic.aiAnalysis}).length)throw new Error('所选话题缺少已保存的中文说明，请先补齐日报后重试。');
 }
}

/** Chinese attitudes belong to this source topic; an English-only estimate is never back-translated. */
export function getDailyCardBattle(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'):ShareEnBattle|undefined {
 if(language==='en')return getShareEnBattle(report,copy,index);
 const id=copy.highlights[index-1]?.topicId;
 const battle=id?report.topics.find(topic=>topic.id===id)?.aiAnalysis?.battle:undefined;
 if(!battle||![battle.redLabel,battle.blueLabel,battle.redRationale,battle.blueRationale].every(value=>typeof value==='string'&&!!value.trim()))return undefined;
 const {redScore,blueScore}=battle;
 if(!Number.isFinite(redScore)||!Number.isFinite(blueScore)||redScore<0||blueScore<0||redScore>100||blueScore>100||redScore+blueScore<=0)return undefined;
 const red=Math.round(redScore/(redScore+blueScore)*100);
 return {redLabel:nativeCardExcerpt(battle.redLabel,12),blueLabel:nativeCardExcerpt(battle.blueLabel,12),redRationale:nativeCardExcerpt(battle.redRationale,32),blueRationale:nativeCardExcerpt(battle.blueRationale,32),redScore:red,blueScore:100-red,basis:'analysis'};
}

function sourceText(topic:DailyReportTopic,candidates:Array<string|undefined>):string {
 const evidence=topicEvidenceTexts({title:topic.title,summary:topic.oneLine,context:topic.whyItMatters,analysis:topic.aiAnalysis});
 return candidates.find((value):value is string=>typeof value==='string'&&evidence.includes(value.trim()))?.trim()??evidence[0]??'';
}

/** A companion view, never submitted to English-only validators or persisted as English copy. */
export function buildChineseDailyCards(report:DailyCardSource,copy:ShareEnCopy):ShareEnCopy {
 assertDailyCardSource(report,copy);
 const topics=report.topics.slice(0,10);
 const highlights=copy.highlights.map((highlight,index)=>{
  const topic=topics.find(topic=>topic.id===highlight.topicId)!;
  return {...highlight,hook:nativeCardExcerpt(topic.title,32),whatHappened:nativeCardExcerpt(sourceText(topic,[topic.aiAnalysis?.detailedContent,topic.aiAnalysis?.summary,topic.oneLine,topic.whyItMatters]),80),context:nativeCardExcerpt(topic.aiAnalysis?.outsiderContext,90),whyItMatters:nativeCardExcerpt(sourceText(topic,[topic.aiAnalysis?.outsiderContext,topic.whyItMatters,topic.aiAnalysis?.summary]),56),battle:getDailyCardBattle(report,copy,index+1,'zh')};
 });
 const top3=highlights.map(highlight=>{
  const topic=topics.find(topic=>topic.id===highlight.topicId)!;
  return {topicId:highlight.topicId,summary:`${highlight.hook}：${nativeCardExcerpt(sourceText(topic,[topic.aiAnalysis?.summary,topic.oneLine,topic.aiAnalysis?.detailedContent]),72)}`};
 });
 const post=[`今日热点 · ${report.reportDate}`,`中文互联网 Top ${topics.length}，精选 ${highlights.length} 个话题展开。`,'',...top3.map((topic,index)=>`${index+1}. ${topic.summary}`),'','WcCAT · 查看卡片了解事件与来源。热度与 AI 情绪能量不代表民调。'].join('\n');
 return {...copy,captionBasis:'highlights',overview:{headline:`今日热点 · 中国 Top ${topics.length}`,summary:nativeCardExcerpt(report.overview,90),topics:topics.map(topic=>({id:topic.id,title:nativeCardExcerpt(topic.title,38)}))},highlights,top3,posts:[{id:'native-zh',template:'native_daily',text:post,reason:'使用同一日报中已保存的中文内容'}],selectedPostId:'native-zh',altTexts:[`WcCAT 今日热点，${report.reportDate}。原始日榜 Top ${topics.length}：${topics.map(topic=>nativeCardExcerpt(topic.title,38)).join('；')}。标记条目附详情卡。`,...highlights.map(highlight=>`${highlight.hook}。${highlight.whatHappened} ${highlight.whyItMatters}`)]};
}
