import type {WccatDailyReport} from './daily-report';
import type {ShareEnBattle,ShareEnCopy} from './shareen-types';

const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const english=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&!/\p{Script=Han}/u.test(v)&&/[a-z]/i.test(v);
function pair(value:unknown):{redScore:number;blueScore:number}|undefined {
 const b=object(value),r=b.redScore,v=b.blueScore;
 if(typeof r!=='number'||typeof v!=='number'||!Number.isFinite(r)||!Number.isFinite(v)||r<0||v<0||r>100||v>100||r+v<=0)return undefined;
 const redScore=Math.round(r/(r+v)*100);return {redScore,blueScore:100-redScore};
}

/** Chinese source attitudes still need translation even when the model returns null. */
export function hasSourceShareEnBattle(report:WccatDailyReport,topicId:string):boolean {
 const value=report.topics.find(t=>t.id===topicId)?.aiAnalysis?.battle;
 return !!pair(value)&&!!value&&[value.redLabel,value.blueLabel,value.redRationale,value.blueRationale].every(v=>typeof v==='string'&&!!v.trim());
}

/** Source scores win over editorial output; estimates never masquerade as existing analysis. */
export function normaliseShareEnBattle(value:unknown,report:WccatDailyReport,topicId:string):ShareEnBattle|undefined {
 const topic=report.topics.find(t=>t.id===topicId);if(!topic)return undefined;
 const b=object(value);
 if(![b.redLabel,b.blueLabel,b.redRationale,b.blueRationale].every(english))return undefined;
 const existing=pair(topic.aiAnalysis?.battle),scores=existing??pair(b);
 if(!scores)return undefined;
 return {redLabel:(b.redLabel as string).trim(),blueLabel:(b.blueLabel as string).trim(),redRationale:(b.redRationale as string).trim(),blueRationale:(b.blueRationale as string).trim(),...scores,basis:existing?'analysis':'estimate'};
}

/** Reuse English only when it belongs to this exact source topic. */
export function resolveShareEnBattle(report:WccatDailyReport,topicId:string,value?:unknown):ShareEnBattle|undefined {
 const saved=normaliseShareEnBattle(value,report,topicId);if(saved)return saved;
 const topic=report.topics.find(t=>t.id===topicId);if(!topic)return undefined;
 const ownEnglish=normaliseShareEnBattle(topic.aiAnalysis?.battle,report,topicId);if(ownEnglish)return ownEnglish;
 return topicId===report.topics[0]?.id&&report.shareEnglish?.topics[0]?.id===topicId?normaliseShareEnBattle(report.shareEnglish?.analysis?.battle,report,topicId):undefined;
}
/** Old caches may reuse the matching TOP1 English analysis, never a different topic's stance. */
export function getShareEnBattle(report:WccatDailyReport,copy:ShareEnCopy,index:number):ShareEnBattle|undefined {
 const h=copy.highlights?.[index-1];return h?resolveShareEnBattle(report,h.topicId,h.battle):undefined;
}
