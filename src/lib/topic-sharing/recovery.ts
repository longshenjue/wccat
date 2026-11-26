import {topicShareFieldLimit} from './contract';
import {topicShareRepairIssues,type TopicShareRepairIssue} from './validation';
import type {LocalizedTopicShare,TopicShareCopy,TopicShareLanguage} from './types';

export function applyEvidenceRepair(draft:Record<string,unknown>,value:unknown,issues:TopicShareRepairIssue[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='patches'))throw new Error('Invalid source-evidence repair response');
 const patches=(value as {patches?:unknown}).patches,allowed=new Set(issues.map(issue=>issue.path));
 if(!Array.isArray(patches)||patches.length!==allowed.size)throw new Error('Source-evidence repair must replace exactly the failing fields');
 const repaired=structuredClone(draft);
 for(const patch of patches){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['path','text'].includes(key))||typeof patch.path!=='string'||!allowed.delete(patch.path)||typeof patch.text!=='string')throw new Error('Source-evidence repair changed an unrequested field or returned a duplicate patch');
  topicShareFieldLimit(patch.path); // Server-defined editable paths only.
  const parts=patch.path.replace(/\[(\d+)\]/gu,'.$1').split('.');
  let cursor=repaired;
  for(const part of parts.slice(0,-1))cursor=cursor[part] as Record<string,unknown>;
  cursor[parts.at(-1)!]=patch.text;
 }
 return repaired;
}

const issueKey=(issue:TopicShareRepairIssue)=>`${issue.path}:${issue.code}`;
const recoveryFields={summary:'摘要',context:'背景',question:'讨论问题',headline:'标题',hook:'开场'};
const recoveryPatterns:Record<string,string>={specific_observation:'具体观察',context:'背景解读',uncertainty:'待核实问题'};
/** Rebuild only failed candidate units from already validated, same-language
 * fields. Whole text only: no truncation, quantity deletion or invented filler.
 * Final validation must clear the unit and introduce no issue elsewhere.
 */
export function recomposeTopicShareCandidates(
 draft:Record<string,unknown>,error:unknown,validate:(draft:Record<string,unknown>)=>TopicShareCopy,
 log?:(level:'info'|'warn'|'error',message:string)=>void
):TopicShareCopy|undefined {
 let issues=topicShareRepairIssues(error);
 if(!issues?.length||issues.some(issue=>!/^(?:en|zh)\.posts\[\d+\]\.(?:text|pattern|reason)$/u.test(issue.path)))return;
 let current=structuredClone(draft);
 const targets=[...new Set(issues.map(issue=>issue.path.replace(/\.(?:text|pattern|reason)$/u,'')))];
 let validations=0;
 // Later units may free a pattern or body that blocked an earlier unit. Each
 // accepted change strictly removes issues; revisit only while making progress.
 for(let pass=0;pass<targets.length;pass++){
  const previousIssueCount=issues.length;
  for(const target of targets){
  if(!issues.some(issue=>issue.path.startsWith(target+'.')))continue;
  const match=target.match(/^(en|zh)\.posts\[(\d+)\]$/u)!;
  const language=match[1] as TopicShareLanguage,index=Number(match[2]),copy=current[language] as LocalizedTopicShare;
  const usedPatterns=new Set(copy.posts.filter((_,i)=>i!==index).map(post=>post.pattern));
  const variants:Array<{field:'summary'|'context'|'question'|'headline'|'hook';pattern:string}>=[
   {field:'summary',pattern:'specific_observation'},{field:'context',pattern:'context'},{field:'question',pattern:'uncertainty'},
   ...(['headline','hook'] as const).map(field=>({field,pattern:/[?？]\s*$/u.test(copy[field])?'uncertainty':'specific_observation'}))
  ];
  const previousKeys=new Set(issues.map(issueKey));
  for(const {field,pattern} of variants){
   if(usedPatterns.has(pattern))continue;
   const limit=topicShareFieldLimit(`${target}.text`),body=copy[field].trim();
   if(Array.from(body).length>limit.maxChars)continue;
   const trial=structuredClone(current),localized=trial[language] as LocalizedTopicShare;
   localized.posts[index]={...localized.posts[index],pattern,text:body,reason:`原候选未通过校验；采用已验证的${recoveryFields[field]}重建为${recoveryPatterns[pattern]}，发布前核对切口。`};
   if(validations++>=60)return;
   try{
    const result=validate(trial);
    log?.('warn',`Candidate recovery: ${target} rebuilt from validated ${language}.${field} (${pattern}); source, selected id and other copy preserved.`);
    return result;
   }catch(nextError){
    const remaining=topicShareRepairIssues(nextError);
    if(!remaining)throw nextError;
    if(remaining.some(issue=>issue.path.startsWith(target+'.')||!previousKeys.has(issueKey(issue))))continue;
    current=trial;issues=remaining;
    log?.('warn',`Candidate recovery: ${target} rebuilt from validated ${language}.${field} (${pattern}); continuing final validation.`);
    break;
   }
  }
  }
  if(issues.length===previousIssueCount)break;
 }
}
