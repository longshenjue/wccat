import type {WccatDailyReport} from './daily-report';
import type {ShareEnBattle,ShareEnCopy} from './shareen-types';

const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const english=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&!/\p{Script=Han}/u.test(v)&&/[a-z]/i.test(v);
/** Only this intentionally compact caption is abbreviated; article body text is never clipped. */
function short(value:string,words:number,characters:number):string {
 const text=value.trim().replace(/\s+/g,' '),parts=text.split(' ');
 let result=parts.slice(0,words).join(' ');
 const shortened=parts.length>words||result.length>characters;
 if(shortened)result=result.slice(0,characters-1).trimEnd().replace(/[.,;:!?…]+$/u,'')+'…';
 return result;
}
function pair(value:unknown):{redScore:number;blueScore:number}|undefined {
 const b=object(value),r=b.redScore,v=b.blueScore;
 if(typeof r!=='number'||typeof v!=='number'||!Number.isFinite(r)||!Number.isFinite(v)||r<0||v<0||r>100||v>100||r+v<=0)return undefined;
 const redScore=Math.round(r/(r+v)*100);return {redScore,blueScore:100-redScore};
}

/** Source scores win over editorial output; estimates never masquerade as existing analysis. */
export function normaliseShareEnBattle(value:unknown,report:WccatDailyReport,topicId:string):ShareEnBattle|undefined {
 const topic=report.topics.find(t=>t.id===topicId);if(!topic)return undefined;
 const b=object(value);
 if(![b.redLabel,b.blueLabel,b.redRationale,b.blueRationale].every(english))return undefined;
 const existing=pair(topic.aiAnalysis?.battle),scores=existing??pair(b);
 if(!scores)return undefined;
 return {redLabel:short(b.redLabel as string,3,30),blueLabel:short(b.blueLabel as string,3,30),redRationale:short(b.redRationale as string,8,72),blueRationale:short(b.blueRationale as string,8,72),...scores,basis:existing?'analysis':'estimate'};
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
