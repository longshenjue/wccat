import type {WccatDailyReport} from '../../src/lib/daily-report';
/** Raw model JSON: the server supplies metadata and composes the branded Top3 captions. */
export function shareEnDraft(report:WccatDailyReport){
 const top=[...report.topics].sort((a,b)=>a.rank-b.rank).slice(0,3);
 const highlights=report.topics.slice(0,3).map(t=>({topicId:t.id,hook:'A closer look at the story',whatHappened:'A story attracted attention across the supplied platforms.',context:'The available report provides some background for readers abroad.',whyItMatters:'It could help overseas readers understand the current discussion.'}));
 return {
  overview:{headline:'China in context',summary:'Science and culture shaped the day.',topics:report.topics.slice(0,10).map((t,i)=>({id:t.id,title:`Daily story ${i+1}`}))},
  highlights,top3:top.map((t,i)=>({topicId:t.id,summary:`Original daily story ${i+1}`})),
  posts:[{id:'digest',template:'daily_digest',text:'Science meets culture.',reason:'条目多元'},{id:'bridge',template:'global_bridge',text:'A view from China.',reason:'海外关联'}],selectedPostId:'bridge',
  altTexts:['The daily news ranking.',...highlights.map(()=>'A selected story explained in context.')]
 };
}

/** A fully populated saved cache for route/UI persistence tests. */
export async function savedShareEnFixture(report:WccatDailyReport){
 const {sourceFingerprint}=await import('../../src/lib/shareen');
 const draft=shareEnDraft(report);
 return {...draft,version:1 as const,generatedAt:'2026-11-16T00:00:00.000Z',model:'fixture',sourceFingerprint:sourceFingerprint(report),posts:draft.posts.map(p=>({...p,text:`WcCAT Daily Hot\n\n${p.text}\n\n${draft.top3.map((t,i)=>`${['1️⃣','2️⃣','3️⃣'][i]} ${t.summary}`).join('\n')}\n\nWcCAT: read the cards. CHINA, IN CONTEXT.`}))};
}
