import {chineseToDigits} from './translation-numbers';

type ResponseFrame={actor:string;event:string;action:string;confirmed:boolean};
type Fact={key:string;clauses?:string;responses:ResponseFrame[];indexes:string[]};

/** Preserve predicates, polarity, question marks, numbers and word boundaries. */
export function newsFactKey(title:string):string {
 let text=title.normalize('NFKC').toLowerCase().trim();
 text=text.replace(/^(?:直播|视频|独家视频)[丨|:：]\s*/u,'');
 text=text.replace(/神(?=(?:[零〇一二两三四五六七八九十百千]+|\d+)(?:号)?(?:发射|载人|乘组|航天员|任务))/gu,'神舟');
 // Only numeric contexts: never rewrite names/idioms such as 三亚 or 一带一路.
 text=text.replace(/(神舟|天舟|嫦娥|天宫|天问|长征)\s*([零〇一二两三四五六七八九十百千]+|\d+)(?:\s*号)?/gu,
  (_,name:string,number:string)=>name+(/^\d/u.test(number)?number:chineseToDigits(number))+'号');
 text=text.replace(/([零〇一二两三四五六七八九十百千]+)(?=(?:年|月|日|号|人|次|元|公里))/gu,number=>chineseToDigits(number));
 text=text.replace(/(神舟\d+号)(?:载人飞船)?(?:发射(?:取得)?(?:圆满)?成功|成功发射)/gu,'$1发射成功');
 text=text.replace(/["“”「」『』]/gu,'').replace(/\s+/gu,' ').replace(/。$/u,'').trim();
 return /[\p{Letter}\p{Number}]/u.test(text)?text:'';
}

function responseFrames(text:string):ResponseFrame[] {
 if(text.length>300)return [];
 const frames:ResponseFrame[]=[];
 const frame=(actor:string,event:string,action:string,confirmed:boolean):ResponseFrame=>
  ({actor:actor.trim(),event:event.trim(),action,confirmed});
 const explicit=text.match(/^(.{2,30}?)(?:就|针对|关于|对)(.+?)(回应|表态)$/u);
 if(explicit)return [frame(explicit[1],explicit[2],explicit[3],true)];
 const front=text.match(/^(.{2,30}?)(回应|表态)[:：]?(.{2,})$/u);
 if(front)return [frame(front[1],front[3],front[2],true)];
 const end=text.match(/^(.+?)(回应|表态)$/u);
 if(end){
  // Event-first headlines have no reliable word boundary. Index candidate splits,
  // but merge only when another headline independently confirms the same frame.
  const boundary=end[1].match(/^(.+)[,，;；]\s*([^,，;；]+)$/u)??end[1].match(/^(.+?)\s+(\S+)$/u);
  if(boundary)return [frame(boundary[2],boundary[1],end[2],true)];
  const prefix=end[1];
  for(let i=Math.max(2,prefix.length-30);i<=prefix.length-2;i++){
   frames.push(frame(prefix.slice(i),prefix.slice(0,i),end[2],false));
  }
 }
 return frames;
}

function municipalActor(actor:string):{place:string;collective:boolean}|undefined {
 const match=actor.match(/^(.{2,8}?)(?:市政府|市委|市人大常委会|市政协)(?:党组)?(等)?$/u);
 return match?{place:match[1],collective:!!match[2]}:undefined;
}
function sameActor(left:string,right:string):boolean {
 if(left===right)return true;
 const a=municipalActor(left),b=municipalActor(right);
 // A city-level headline can abbreviate a named institution or a collective
 // “...等表态”. Two explicitly different singular institutions stay separate.
 if(a&&b)return a.place===b.place&&(a.collective||b.collective);
 return !!((a&&(right===a.place||right===a.place+'市'))||(b&&(left===b.place||left===b.place+'市')));
}
function describe(title:string):Fact {
 const key=newsFactKey(title),responses=responseFrames(key);
 const parts=key.split(/[,，;；]/u).map(value=>value.trim()).filter(Boolean);
 const clauses=parts.length>=2&&parts.length<=6?JSON.stringify([...parts].sort()):undefined;
 return {key,clauses,responses,indexes:[`exact:${key}`,...(clauses?[`clauses:${clauses}`]:[]),
  ...responses.map(frame=>JSON.stringify([frame.action,frame.event]))]};
}
function sameFact(left:Fact,right:Fact):boolean {
 if(!left.key||!right.key)return false;
 if(left.key===right.key)return true;
 if(left.clauses&&left.clauses===right.clauses)return true;
 return left.responses.some(a=>right.responses.some(b=>(a.confirmed||b.confirmed)&&a.action===b.action&&a.event===b.event&&sameActor(a.actor,b.actor)));
}
export function sameNewsFact(left:string,right:string):boolean {
 return sameFact(describe(left),describe(right));
}

/** Complete-link grouping: an ambiguous bridge cannot unite incompatible facts.
 * Descriptors and indexes live only for this run; no cross-day cache or AI calls.
 */
export function groupNewsFacts<T>(items:readonly T[],titleOf:(item:T)=>string):T[][] {
 const groups:Array<{items:T[];facts:Fact[]}>=[],index=new Map<string,Set<number>>();
 const descriptions=new Map<string,Fact>();
 for(const item of items){
  const title=titleOf(item),fact=descriptions.get(title)??describe(title),candidates=new Set<number>();
  descriptions.set(title,fact);
  if(fact.key)for(const key of fact.indexes)for(const id of index.get(key)??[])candidates.add(id);
  let id=[...candidates].find(id=>groups[id].facts.every(previous=>sameFact(previous,fact)));
  if(id===undefined){id=groups.length;groups.push({items:[],facts:[]});}
  const group=groups[id];group.items.push(item);
  if(!group.facts.some(previous=>previous.key===fact.key))group.facts.push(fact);
  if(fact.key)for(const key of fact.indexes){const ids=index.get(key)??new Set<number>();ids.add(id);index.set(key,ids);}
 }
 return groups.map(group=>group.items);
}
