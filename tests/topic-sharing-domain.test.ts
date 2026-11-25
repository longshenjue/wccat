import test from 'node:test';
import assert from 'node:assert/strict';
import {EDITORIAL_COLUMNS,columnForLanguage} from '../src/lib/topic-sharing/columns';
import {eligibleColumns,recommendTopic,usableTopicQuotes} from '../src/lib/topic-sharing/recommendation';
import {validateTopicShareCopy} from '../src/lib/topic-sharing/validation';
import type {TopicShareCopy,TopicShareSource} from '../src/lib/topic-sharing/types';
import {snapshot} from './helpers/data-fixtures';
import {summarizeTopic} from '../src/lib/summary';
import {buildFallbackTopicAnalysis} from '../src/lib/topic-analysis';
import {spaceContent,spaceSource} from './helpers/topic-sharing-space-fixture';

function source():TopicShareSource {
 return {ref:{kind:'daily',date:'2026-11-24',topicId:'battery'},sourceKey:'daily:battery',fingerprint:'a'.repeat(64),date:'2026-11-24',observedAt:'2026-11-24T01:00:00.000Z',topicId:'battery',title:'汽车厂商公布电池升级计划',summary:'厂商公布电池升级计划，具体安排仍待说明。',detail:'相关报道描述了电池升级安排，目前材料没有提供价格与发布时间。',context:'从已保存报道了解厂商计划，不能把计划当成已经落地的产品。',categories:['科技','汽车'],rank:1,signal:'相关报道进入榜单',links:[{sourceId:'zhihu',sourceName:'知乎',title:'电池升级计划',url:'https://www.zhihu.com/question/123'}]};
}
function withComment():TopicShareSource {
 const value=source();
 value.analysis={summary:value.summary,detailedContent:value.detail,outsiderContext:value.context,model:'saved-analysis',platformAnalyses:[],battle:{redLabel:'期待说明',blueLabel:'等待验证',redScore:40,blueScore:60,redRationale:'等待细节',blueRationale:'等待验证'}};
 value.commentExamples={redLabel:'期待说明',blueLabel:'等待验证',sampleCount:1,sampledAt:value.observedAt,runIds:['saved-run'],red:{id:'zhihu:77',text:'请先说清楚具体升级安排。',englishText:'Please explain the upgrade plan first.',sourceId:'zhihu',sourceName:'知乎',articleUrl:value.links[0].url,url:value.links[0].url,rank:1,likes:9,observedAt:value.observedAt}};
 return value;
}

test('column lookup exposes a distinct bilingual name for each usable series',()=>{
 assert.equal(columnForLanguage('inside','en'),"Inside China's Internet");
 assert.equal(columnForLanguage('voices','zh'),'他们怎么说');
 assert.equal(EDITORIAL_COLUMNS.length,3);
 assert.equal(new Set(EDITORIAL_COLUMNS.map(column=>column.description)).size,3);
});
test('a tech topic is eligible for tech but cannot invent a voices column',()=>{
 const value=source(),recommendation=recommendTopic(value);
 assert.deepEqual(eligibleColumns(value),['inside','tech']);
 assert.equal(recommendation.column,'tech');
 assert.equal(recommendation.evidenceLevel,'analysis');
 assert.match(recommendation.english.reason,/editorial priority/i);
 assert.match(recommendation.chinese.reason,/编辑优先级/);
 assert.notEqual(recommendation.english.angle,recommendation.chinese.angle);
 assert.ok(recommendation.english.score>=0&&recommendation.english.score<=100);
 assert.ok(recommendation.chinese.score>=0&&recommendation.chinese.score<=100);
});
test('a single saved bilingual comment enables voices without manufacturing another side',()=>{
 const value=withComment();
 assert.deepEqual(eligibleColumns(value),['inside','voices','tech']);
 assert.equal(recommendTopic(value).column,'voices');
 assert.equal(recommendTopic(value).evidenceLevel,'comments');
 assert.deepEqual(usableTopicQuotes(value,'en').map(row=>row.quote.id),['zhihu:77']);
 assert.deepEqual(usableTopicQuotes(value,'zh').map(row=>row.text),['请先说清楚具体升级安排。']);
 assert.equal(value.commentExamples?.blue,undefined);
});
test('voices rejects missing English translation, mismatched labels and unsafe provenance',()=>{
 for(const corrupt of [
  (value:TopicShareSource)=>{delete value.commentExamples!.red!.englishText;},
  (value:TopicShareSource)=>{value.commentExamples!.redLabel='不匹配';},
  (value:TopicShareSource)=>{value.commentExamples!.red!.url='https://example.com/forged';},
  (value:TopicShareSource)=>{value.commentExamples!.red!.observedAt='invalid';},
  (value:TopicShareSource)=>{delete value.analysis;}
 ]){
  const value=withComment();corrupt(value);
  assert.ok(!eligibleColumns(value).includes('voices'));
  assert.deepEqual(usableTopicQuotes(value,'zh'),[]);
 }
});
test('saved analysis comments remain usable when the top-level comment field is absent',()=>{
 const value=withComment();value.analysis!.commentExamples=value.commentExamples;delete value.commentExamples;
 assert.ok(eligibleColumns(value).includes('voices'));
});
test('headline-only topics stay low priority and warn that a meme needs verification',()=>{
 const value=source();value.title='震惊全网：宠物米线又火了';value.summary='';value.detail='';value.context='';value.categories=['文化','生活'];
 const result=recommendTopic(value);
 assert.equal(result.column,'inside');assert.equal(result.evidenceLevel,'headline');
 assert.ok(result.english.score<40);assert.ok(result.chinese.score<40);
 assert.ok(result.warnings.some(warning=>/标题/.test(warning)));
 assert.ok(result.warnings.some(warning=>/梗|核实/.test(warning)));
 assert.match(result.english.angle,/meme|context|verify/i);
});
test('English culture translation and Chinese everyday relevance are separately prioritized',()=>{
 const culture=source();culture.title='网络用语成为讨论焦点';culture.categories=['文化','梗'];
 const life=source();life.title='社区生活服务调整';life.categories=['生活'];
 assert.ok(recommendTopic(culture).english.score>recommendTopic(life).english.score);
 assert.ok(recommendTopic(life).chinese.score>recommendTopic(culture).chinese.score);
 assert.deepEqual(eligibleColumns(life),['inside']);
});
test('黄仁勋辞职 is recognized as a technology entity with a specific cautious editorial angle',()=>{
 const value=source();value.title='黄仁勋辞职';value.categories=['business','news'];value.summary='已保存报道以黄仁勋辞职为标题，具体情况仍需核实。';value.detail='材料尚未说明正式公告与具体安排。';value.context='已有材料提及英伟达，应区分标题说法与可核对的公告。';
 const recommendation=recommendTopic(value);
 assert.ok(eligibleColumns(value).includes('tech'));assert.equal(recommendation.column,'tech');
 assert.ok(recommendation.english.angle.includes('黄仁勋辞职'));
 assert.match(recommendation.english.angle,/核实|核对|确认/);
 assert.ok(recommendation.chinese.angle.includes('黄仁勋辞职'));
 const newsOnly=structuredClone(value);newsOnly.categories=['news'];
 assert.ok(recommendation.english.score>recommendTopic(newsOnly).english.score,'business category contributes to the editorial heuristic');
});
test('影视飓风1800万粉丝QA gets a creator-culture angle above a generic celebrity story without treating all video as memes',()=>{
 const creator=source();creator.title='为什么是最后一期？影视飓风1800万粉丝Q&A！';creator.categories=['video'];creator.summary='影视飓风发布粉丝问答，简介称可能是短期内最后一期。';creator.detail='保存材料记录了视频标题与简介，没有说明后续内容安排。';creator.context='这是B站UP主与粉丝的问答场景，需要解释创作者社区语境。';
 const celebrity=structuredClone(creator);celebrity.title='某明星现身活动现场';celebrity.summary='保存的报道记录了活动现场。';celebrity.detail='现场活动成为资讯条目。';celebrity.context='活动情况以保存材料为准。';celebrity.categories=['entertainment'];
 const recommendation=recommendTopic(creator);
 assert.equal(recommendation.column,'inside');
 assert.ok(recommendation.english.score>recommendTopic(celebrity).english.score);
 assert.ok(recommendation.english.angle.includes('影视飓风'));
 assert.match(recommendation.english.angle,/创作者|粉丝|社区/);
 assert.ok(recommendation.chinese.angle.includes('影视飓风'));
 const neutralVideo=structuredClone(celebrity);neutralVideo.categories=['video'];
 assert.equal(recommendTopic(neutralVideo).english.score,recommendTopic(celebrity).english.score);
 assert.doesNotMatch(recommendTopic(neutralVideo).english.angle,/属于梗|meme现象|梗的传播/);
});
test('saved context can reveal cultural or technology relevance without mistaking everyday apples for a tech company',()=>{
 const cultural=source();cultural.title='这个视频里的表达是什么意思';cultural.categories=['video'];cultural.summary='已保存材料解释了猫meme二创与弹幕的使用场景。';cultural.detail='材料保留了具体表达及其上下文。';cultural.context='这是一段围绕鬼畜二创的创作者社区讨论。';
 const plain=structuredClone(cultural);plain.summary='保存材料描述了具体视频内容。';plain.context='这是保存的一段视频报道。';
 assert.ok(recommendTopic(cultural).english.score>recommendTopic(plain).english.score);
 const fruit=source();fruit.title='苹果价格回落';fruit.categories=['生活'];fruit.summary='市场报道记录了水果价格变化。';fruit.detail='材料讨论果蔬消费。';fruit.context='这是日常食品消费情况。';
 assert.ok(!eligibleColumns(fruit).includes('tech'));
});
function attentionOnlySource(multiple=false,localAnalysis=false):TopicShareSource {
 const topic=snapshot('2026-11-24-10').topics[0];topic.title='广东省委常委、广州市委书记冯忠华任广东省委副书记';topic.categories=['news','business'];
 topic.occurrences=[{...topic.occurrences[0],title:topic.title,sourceName:'腾讯新闻'}];
 if(multiple)topic.occurrences.push({...topic.occurrences[0],sourceId:'thepaper',sourceName:'澎湃新闻'});
 topic.summary=summarizeTopic(topic.title,topic.occurrences);
 const analysis=localAnalysis?buildFallbackTopicAnalysis(topic):undefined;
 return {...source(),title:topic.title,categories:topic.categories,summary:analysis?.summary??topic.summary.oneLine,detail:analysis?.detailedContent??'',context:analysis?.outsiderContext??topic.summary.context,analysis};
}
test('actual local summary and local-rules attention templates remain headline evidence at low priority',()=>{
 for(const multiple of [false,true])for(const localAnalysis of [false,true]){
  const value=attentionOnlySource(multiple,localAnalysis),recommendation=recommendTopic(value);
  assert.equal(recommendation.evidenceLevel,'headline');assert.ok(recommendation.english.score<=32);assert.ok(recommendation.chinese.score<=32);
  assert.ok(recommendation.warnings.some(warning=>warning.includes('仅有标题')));
  assert.doesNotMatch(recommendation.english.angle,/材料切口：/);
  assert.deepEqual(eligibleColumns(value),['inside'],'publisher names and local boilerplate do not make an official appointment a tech story');
 }
});
test('specific saved descriptions and AI details remain evidence alongside local fallback material',()=>{
 const description=attentionOnlySource(true,true);description.detail='原始报道明确任命已经公布，并记录了新任职务。';
 assert.equal(recommendTopic(description).evidenceLevel,'analysis');
 const ai=attentionOnlySource(true,true);ai.analysis!.model='deepseek-test';ai.analysis!.detailedContent='原始报道明确任命已经公布，并记录了新任职务。';
 assert.equal(recommendTopic(ai).evidenceLevel,'analysis');
 const localWithDescription=attentionOnlySource(true,true);localWithDescription.summary='原始报道明确任命已经公布，并记录了新任职务。';
 assert.equal(recommendTopic(localWithDescription).evidenceLevel,'analysis','a local-rules model label must not erase real source descriptions');
});
test('political commemoration facts mentioning Tencent as a distributor do not become a tech story',()=>{
 const value=source();value.title='纪念孙中山先生诞辰160周年';value.categories=['video','search','news'];
 value.summary='纪念孙中山诞辰160周年大会在京举行，习近平出席并讲话，抖音、百度、腾讯、新浪等平台推送，热搜高位，讨论以官方纪念和仪式性关注为主。';
 value.detail='纪念大会在北京人民大会堂举行。新华社快讯、央视视频等成为主信息源；抖音热点第2、百度热搜第1、腾讯新闻第1，热度差异明显。';
 value.context='保存材料主要是通稿传播，缺少独立争论。';
 assert.deepEqual(eligibleColumns(value),['inside']);assert.equal(recommendTopic(value).column,'inside');
 assert.equal(recommendTopic(value).evidenceLevel,'analysis','actual event facts remain usable');
 const company=source();company.title='公司发布新功能';company.categories=['business'];company.summary='腾讯宣布推出新的人工智能工具，并公布具体功能说明。';company.detail='';company.context='保存材料记录了具体产品变化。';
 assert.ok(eligibleColumns(company).includes('tech'),'a company acting as the subject in saved reporting remains a technology cue');
});

function copy():TopicShareCopy {
 return {
  version:1,generatedAt:'2026-11-24T02:00:00.000Z',model:'deepseek-test',sourceFingerprint:'a'.repeat(64),column:'tech',
  en:{headline:'A battery upgrade plan needs detail',hook:'What does this battery plan actually promise?',summary:'A carmaker has announced a battery upgrade plan. The saved reporting does not specify pricing or a release date.',context:'An announced plan should be read separately from an available product.',whyItMatters:'The practical questions are still open in the saved reporting.',question:'Which detail would you want clarified?',posts:[{id:'en-a',pattern:'specific_observation',text:'A battery upgrade plan is attracting attention. The saved reporting leaves the practical details open.',reason:'Lead with the concrete announcement.'},{id:'en-b',pattern:'context',text:'An upgrade plan has been announced. An available product is a different question.',reason:'Keep the timing distinction visible.'},{id:'en-c',pattern:'uncertainty',text:'A carmaker has a battery plan. The saved reports leave pricing and release timing unspecified.',reason:'Foreground the missing details.'}],selectedPostId:'en-a',replies:['The saved reporting describes a plan, with details still pending.'],altText:'WcCAT card explaining a battery upgrade plan and the limits of the saved information.'},
  zh:{headline:'电池升级计划，先看清哪些信息还没公布',hook:'宣布升级计划之后，还需要哪些具体说明？',summary:'厂商公布了电池升级计划，但保存的报道尚未提供价格和发布时间。',context:'公布计划与产品已经落地是不同阶段，解读时需要区分。',whyItMatters:'实际安排仍待说明，关注具体信息比扩大解读更有帮助。',question:'你最想先看到哪项具体说明？',posts:[{id:'zh-a',pattern:'specific_observation',text:'电池升级计划公布了，价格和发布时间仍待说明。先看清已知信息与空白。',reason:'从具体进展切入。'},{id:'zh-b',pattern:'context',text:'从升级计划到实际产品，中间还需要具体安排。已保存报道目前讲的是计划。',reason:'说明所处阶段。'},{id:'zh-c',pattern:'uncertainty',text:'这份电池升级计划，哪些已说明、哪些还没有？目前保存材料未提供价格和发布时间。',reason:'保留信息边界。'}],selectedPostId:'zh-a',replies:['具体安排仍待说明，后续应以可核实报道为准。'],altText:'WcCAT电池升级计划卡片，说明已知进展以及尚未公布的信息。'}
 };
}
test('validation returns a complete localized package without changing source evidence',()=>{
 const value=source(),before=structuredClone(value),draft=copy();
 assert.deepEqual(validateTopicShareCopy(draft,value),draft);assert.deepEqual(value,before);
});
test('validation rejects stale source identity and unavailable column choices',()=>{
 const stale=copy();stale.sourceFingerprint='b'.repeat(64);
 assert.throws(()=>validateTopicShareCopy(stale,source()),/fingerprint/i);
 const voices=copy();voices.column='voices';
 assert.throws(()=>validateTopicShareCopy(voices,source()),/column|comment/i);
 assert.equal(validateTopicShareCopy(voices,withComment()).column,'voices');
 const life=source();life.title='社区服务调整';life.categories=['生活'];
 assert.throws(()=>validateTopicShareCopy(copy(),life),/column/i);
});

test('Shenzhou-24 and November 24 preserve their Chinese numbers while failures name the exact field and quantity',()=>{
 const value=spaceSource(),content=spaceContent(),draft={...content,version:1,generatedAt:value.observedAt,model:'test',sourceFingerprint:value.fingerprint};
 assert.equal(validateTopicShareCopy(draft,value).en.summary,content.en.summary);
 draft.en.hook='One astronaut, a Chinese poem and a cultural connection.';
 assert.throws(()=>validateTopicShareCopy(draft,value),(error:unknown)=>error instanceof Error&&/en\.hook/.test(error.message)&&/\b1\b/.test(error.message));
});
test('validation requires English without Han and independently localized Chinese content',()=>{
 const han=copy();han.en.summary='An update with 中文 mixed in.';
 assert.throws(()=>validateTopicShareCopy(han,source()),/English|Han/i);
 const copied=copy();copied.zh=structuredClone(copied.en);
 assert.throws(()=>validateTopicShareCopy(copied,source()),/Chinese|localized|Han/i);
 const same=copy();same.zh.hook=same.en.hook;
 assert.throws(()=>validateTopicShareCopy(same,source()),/Chinese|localized|Han/i);
});
test('validation requires exactly three distinct candidate IDs, texts, patterns and a selected ID',()=>{
 for(const corrupt of [
  (draft:TopicShareCopy)=>{draft.en.posts.pop();},
  (draft:TopicShareCopy)=>{draft.en.posts[1].id=draft.en.posts[0].id;},
  (draft:TopicShareCopy)=>{draft.zh.posts[1].text=draft.zh.posts[0].text;},
  (draft:TopicShareCopy)=>{draft.en.posts[1].pattern=draft.en.posts[0].pattern;},
  (draft:TopicShareCopy)=>{draft.zh.selectedPostId='unknown';}
 ]){const draft=copy();corrupt(draft);assert.throws(()=>validateTopicShareCopy(draft,source()),/post|candidate|pattern|selected/i);}
});
test('candidate selection reasons may use Chinese administrator notes without entering public English copy',()=>{
 const draft=copy();draft.en.posts[0].reason='以已保存的具体进展作为开场，避免扩大解读。';
 assert.equal(validateTopicShareCopy(draft,source()).en.posts[0].reason,draft.en.posts[0].reason);
});
test('candidate patterns reject unrecognized names and evidence-free quote or number formats',()=>{
 for(const pattern of ['algorithm_guarantee','source_voice','number_context']){
  const draft=copy();draft.en.posts[0].pattern=pattern;
  assert.throws(()=>validateTopicShareCopy(draft,source()),/pattern|evidence|number|comment/i);
 }
 const valid=copy();valid.column='voices';valid.en.posts[0].pattern='source_voice';
 assert.equal(validateTopicShareCopy(valid,withComment()).en.posts[0].pattern,'source_voice');
});
test('validation bounds card text, candidate posts, replies and image descriptions',()=>{
 const englishWords=(count:number)=>Array(count).fill('material').join(' ');
 for(const corrupt of [
  (draft:TopicShareCopy)=>{draft.en.headline=englishWords(19);},
  (draft:TopicShareCopy)=>{draft.zh.headline='字'.repeat(46);},
  (draft:TopicShareCopy)=>{draft.en.summary=englishWords(71);},
  (draft:TopicShareCopy)=>{draft.zh.summary='字'.repeat(201);},
  (draft:TopicShareCopy)=>{draft.en.context=englishWords(71);},
  (draft:TopicShareCopy)=>{draft.zh.context='字'.repeat(221);},
  (draft:TopicShareCopy)=>{draft.en.whyItMatters=englishWords(46);},
  (draft:TopicShareCopy)=>{draft.zh.whyItMatters='字'.repeat(151);},
  (draft:TopicShareCopy)=>{draft.en.posts[0].text='a'.repeat(281);},
  (draft:TopicShareCopy)=>{draft.zh.posts[0].text='字'.repeat(141);},
  (draft:TopicShareCopy)=>{draft.en.replies=Array(5).fill('A source note.');},
  (draft:TopicShareCopy)=>{draft.zh.replies=['字'.repeat(1001)];},
  (draft:TopicShareCopy)=>{draft.en.altText='a'.repeat(2001);}
 ]){const draft=copy();corrupt(draft);assert.throws(()=>validateTopicShareCopy(draft,source()),/length|long|limit|words|repl/i);}
});
test('validation rejects model-owned links, comments, quotation fields and like counts at every level',()=>{
 for(const inject of [
  (draft:Record<string,unknown>)=>{draft.links=source().links;},
  (draft:Record<string,unknown>)=>{(draft.en as Record<string,unknown>).comments=[];},
  (draft:Record<string,unknown>)=>{(draft.zh as Record<string,unknown>).quotes=['假评论'];},
  (draft:Record<string,unknown>)=>{((draft.en as Record<string,unknown>).posts as Array<Record<string,unknown>>)[0].likes=500;}
 ]){const draft=copy() as unknown as Record<string,unknown>;inject(draft);assert.throws(()=>validateTopicShareCopy(draft,source()),/owned|Unknown|Unexpected/i);}
 const url=copy();url.en.replies=['Read https://malicious.example/new-source'];
 assert.throws(()=>validateTopicShareCopy(url,source()),/URL|link|source/i);
});
test('validation blocks new numerical facts including written counts, ratios, dates and currency role changes',()=>{
 for(const claim of ['It affects two million users.','Half of buyers support it.','It launches on December 25, 2026.','The price is 999 yuan.','Most users support it.','所有消费者都支持这次升级。']){
  const draft=copy();if(/[\p{Script=Han}]/u.test(claim))draft.zh.summary=claim;else draft.en.summary=claim;
  assert.throws(()=>validateTopicShareCopy(draft,source()),/ground|number|population|representative|support/i);
 }
 const quantified=source();quantified.summary='报道提及价格为100元。';
 const wrongRole=copy();wrongRole.en.summary='The product costs 100 dollars.';
 assert.throws(()=>validateTopicShareCopy(wrongRole,quantified),/ground|number|role/i);
 const correct=copy();correct.en.summary='The saved report mentions a price of 100 yuan.';
 assert.equal(validateTopicShareCopy(correct,quantified).en.summary,correct.en.summary);
});
test('hyphenated magnitudes preserve their source quantity without permitting a new count or scale',()=>{
 const quantified=source();quantified.summary='创作者发布1800万粉丝问答。';
 for(const quantity of ['18-million-follower','18‑million‑follower','eighteen-million-follower','18M-follower']){
  const draft=copy();draft.en.summary=`The creator posted an ${quantity} Q&A.`;
  assert.equal(validateTopicShareCopy(draft,quantified).en.summary,draft.en.summary);
 }
 for(const quantity of ['19-million-follower','nineteen-million-follower','18-billion-follower','eighteen-billion-follower']){
  const draft=copy();draft.en.summary=`The creator posted an ${quantity} Q&A.`;
  assert.throws(()=>validateTopicShareCopy(draft,quantified),/ground|number/i);
 }
 const decimal=source();decimal.summary='视频有180万播放。';
 const draft=copy();draft.en.summary='The source describes a 1.8-million-play video.';
 assert.equal(validateTopicShareCopy(draft,decimal).en.summary,draft.en.summary);
});
test('ALT text fits the X limit of one thousand Unicode characters in either language',()=>{
 const draft=copy();draft.en.altText='A'+'🙂'.repeat(999);draft.zh.altText='字'.repeat(1000);
 assert.equal(Array.from(validateTopicShareCopy(draft,source()).en.altText).length,1000);
 for(const language of ['en','zh'] as const){
  const oversized=copy();oversized[language].altText=language==='en'?'A'+'🙂'.repeat(1000):'字'.repeat(1001);
  assert.throws(()=>validateTopicShareCopy(oversized,source()),/length|limit/i);
 }
});
test('an explicit absence of saved comments is allowed while unsupported positive claims still fail',()=>{
 for(const sentence of ['The saved material does not include viewer comments, so this package cannot say how fans interpreted the announcement.','No saved viewer comments are available.','The saved material has no comments to assess.',"The saved material includes the video title, description and a Bilibili ranking snapshot. It does not include the video's explanation of the pause, viewer comments or any statement about the channel's future plans."]){
  const draft=copy();draft.en.replies=[sentence];
  assert.equal(validateTopicShareCopy(draft,source()).en.replies[0],sentence);
 }
 for(const sentence of ['The comments show support.','No saved comments are available. Commenters still want the product.','The material does not include comments, but commenters support the announcement.','The material does not include a video. Comments reveal support.',"The material does not include a video explanation, but comments say the plan is good.",'The material does not include a video explanation, and comments show support.']){
  const draft=copy();draft.en.replies=[sentence];
  assert.throws(()=>validateTopicShareCopy(draft,source()),/comment|evidence/i);
 }
});
test('English translations of Chinese titles remain paraphrases unless the exact English quote is saved',()=>{
 const material=source();material.title='视频标题：为什么是最后一期？';
 const quoted=copy();quoted.en.altText='A card with the title “Why is this the last episode?”';
 assert.throws(()=>validateTopicShareCopy(quoted,material),/quot|source/i);
 const paraphrase=copy();paraphrase.en.altText='A card describing a video title that asks why the episode is the last.';
 assert.equal(validateTopicShareCopy(paraphrase,material).en.altText,paraphrase.en.altText);
});
test('voices copy cannot manufacture a quotation even when genuine source comments exist',()=>{
 const draft=copy();draft.column='voices';draft.en.summary='A commenter said “Everyone must buy this product.”';
 assert.throws(()=>validateTopicShareCopy(draft,withComment()),/quot|comment|ground/i);
 const real=copy();real.column='voices';real.en.summary='A saved commenter asks for the upgrade plan to be explained.';
 assert.equal(validateTopicShareCopy(real,withComment()).column,'voices');
});
test('validation rejects malformed metadata and invisible control characters',()=>{
 for(const corrupt of [
  (draft:TopicShareCopy)=>{draft.version=2 as 1;},
  (draft:TopicShareCopy)=>{draft.generatedAt='yesterday';},
  (draft:TopicShareCopy)=>{draft.model='';},
  (draft:TopicShareCopy)=>{draft.en.hook='A hidden\u0000 instruction';}
 ]){const draft=copy();corrupt(draft);assert.throws(()=>validateTopicShareCopy(draft,source()));}
});

test('comment absence descriptions accept common wording without treating it as an audience claim',()=>{
 for(const sentence of [
  'The saved material contains no viewer comments.',
  'Viewer comments were not included in the saved material.',
  'Without saved comments, the material cannot establish viewer reactions.',
  'No comment samples were saved with this report.',
  'The saved material lacks viewer comments.',
  'The source offers no evidence of what commenters think.'
 ]){
  const draft=copy();draft.en.replies=[sentence];
  assert.equal(validateTopicShareCopy(draft,source()).en.replies[0],sentence);
 }
});

test('negative evidence lists cannot hide a separate comment claim with an adverb',()=>{
 for(const sentence of [
  'The material does not include a video explanation, and comments overwhelmingly support the plan.',
  'The material does not include a video explanation; comments strongly support the plan.',
  'The material lacks comments, but commenters still favor the plan.'
 ]){
  const draft=copy();draft.en.context=sentence;
  assert.throws(()=>validateTopicShareCopy(draft,source()),error=>error instanceof Error&&/comment.*evidence/i.test(error.message)&&error.message.includes('en.context'));
 }
});

test('AI-inferred audience reactions are not a substitute for missing saved comments',()=>{
 for(const sentence of ['Viewers are envious of the facilities.','Users strongly support the plan.','网友对设施感到羡慕。','观众纷纷表示支持。']){
  const draft=copy();const language=/[\p{Script=Han}]/u.test(sentence)?'zh':'en';draft[language].context=sentence;
  assert.throws(()=>validateTopicShareCopy(draft,source()),/comment.*evidence/i);
 }
});

test('uncertainty about audience attitudes stays distinct from a new claim after it',()=>{
 for(const sentence of ['The material cannot establish what viewers think.','The material cannot confirm whether users support the plan.','The material cannot establish whether viewers are envious of the facilities.','It is unclear whether users support the plan.','材料无法判断网友是否支持。']){
  const draft=copy(),language=/[\p{Script=Han}]/u.test(sentence)?'zh':'en';draft[language].context=sentence;
  assert.equal(validateTopicShareCopy(draft,source())[language].context,sentence);
 }
 const draft=copy();draft.en.context='The material cannot establish what viewers think, but users strongly support the plan.';
 assert.throws(()=>validateTopicShareCopy(draft,source()),/comment.*evidence/i);
});

test('missing-comment list items can have noun modifiers without inheriting a new predicate',()=>{
 for(const sentence of [
  'The saved material does not include the video transcript, viewer comments about the facilities or pricing details.',
  'The saved material does not include a transcript, viewer comments from visitors, or pricing details.',
  'The saved material does not include a transcript, viewer comments on the venue or pricing details.'
 ]){
  const draft=copy();draft.en.replies=[sentence];assert.equal(validateTopicShareCopy(draft,source()).en.replies[0],sentence);
 }
 const draft=copy();draft.en.context='The saved material does not include a video, and comments from visitors clearly support the plan.';
 assert.throws(()=>validateTopicShareCopy(draft,source()),/comment.*evidence/i);
});
