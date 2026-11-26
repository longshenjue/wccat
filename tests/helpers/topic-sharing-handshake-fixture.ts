import type {TopicShareSource} from '../../src/lib/topic-sharing/types';

/** Saved source text behind the reported Nov25 handshake card; not a fact check. */
export function handshakeSource():TopicShareSource {
 const url='https://new.qq.com/rain/a/20261125A09LXC00';
 const battle={redLabel:'中国航天开放合作，国际影响力提升',blueLabel:'更关注航天成就本身，国际合作是锦上添花',redScore:55,blueScore:45,redRationale:'材料强调国际合作。',blueRationale:'材料没有提供对应反方评论。'};
 const summary='神舟二十四号乘组进驻天宫，首次迎来外籍航天员，中外航天员实现“太空握手”，多平台热搜聚焦这一历史性时刻。';
 const detail='2026年11月25日，神舟二十四号载人飞船成功发射并对接天宫空间站，乘组顺利进驻。此次任务首次有外籍航天员（巴基斯坦籍）参与，中外航天员在太空实现首次“握手”，并拍下第一张太空合影。';
 const context='保存材料将此次握手作为中国载人航天国际合作的具体场景。';
 const commentExamples={redLabel:battle.redLabel,blueLabel:battle.blueLabel,sampleCount:10,sampledAt:'2026-11-25T18:00:03.281Z',runIds:['saved-handshake-run'],red:{
  id:'qq-news:7531252475235774585',text:'巴基斯坦航天员是中国天宫到访的第一个外籍航天员，航天员同志们辛苦了！祝你们身体健康！完成光荣而伟大的空间站驻守任务！愿中巴友谊长存！',
  englishText:"The Pakistani astronaut is the first foreign astronaut to visit China's Tiangong. Comrades, you've worked hard! Wishing you good health! May China-Pakistan friendship last forever!",
  englishIsExcerpt:true,sourceId:'qq-news',sourceName:'腾讯新闻',articleUrl:url,url,likes:220,rank:2,observedAt:'2026-11-25T18:00:03.281Z'
 }};
 return {ref:{kind:'daily',date:'2026-11-25',topicId:'中外航天员实现首次太空握手'},sourceKey:'daily:handshake',fingerprint:'c'.repeat(64),date:'2026-11-25',observedAt:'2026-11-25T18:00:25.113Z',topicId:'中外航天员实现首次太空握手',title:'中外航天员实现首次“太空握手”',summary,detail,context,categories:['search','news'],rank:2,signal:'dominant',links:[{sourceId:'qq-news',sourceName:'腾讯新闻',title:'视频丨中外航天员实现首次“太空握手” 神二十四乘组顺利进驻“天宫”',url}],commentExamples,
  analysis:{summary,detailedContent:detail,outsiderContext:context,battle,platformAnalyses:[],model:'saved-fixture',changeReason:'保存分析',commentExamples}};
}
export function handshakeContent(){
 return {column:'voices',
  en:{headline:'A handshake aboard Tiangong brings international cooperation into view',hook:'The Tiangong encounter gives this space story a concrete scene.',summary:'The saved material describes the Shenzhou-24 crew entering Tiangong and a handshake involving Chinese and foreign astronauts.',context:'The material frames the encounter as an international-cooperation milestone. The attached comment expresses support for the mission.',whyItMatters:'The encounter provides a concrete scene for reading the cooperation story.',question:'What background helps explain this encounter?',posts:[{id:'voice',pattern:'source_voice',text:'The attached comment supports the mission and expresses hopes for China-Pakistan friendship. It is an individual response.',reason:'只解读已保存个人评论。'},{id:'observation',pattern:'specific_observation',text:'A handshake involving Chinese and foreign astronauts gives the Shenzhou-24 story a concrete scene aboard Tiangong.',reason:'从材料中的具体动作切入。'},{id:'context',pattern:'context',text:'The saved account connects the Tiangong encounter with international cooperation. A handshake gives that framing a visible scene.',reason:'补充报道语境。'}],selectedPostId:'observation',replies:[],altText:'A WcCAT card about a handshake involving Chinese and foreign astronauts aboard Tiangong, with a saved supportive comment.'},
  zh:{headline:'天宫里的中外航天员握手',hook:'从天宫里的具体场景理解这次航天报道。',summary:'保存材料记录了神舟二十四号乘组进驻天宫，中外航天员在空间站握手。',context:'材料将握手放在国际合作的叙事中，附带个人评论表达了对任务的支持。',whyItMatters:'具体场景有助于理解报道所强调的合作意义。',question:'理解这个场景，还需要补充哪些背景？',posts:[{id:'voice',pattern:'source_voice',text:'附带评论表达了对任务的支持，以及对中巴友谊的祝愿。这里呈现的是个人发言。',reason:'保留个人评论的范围。'},{id:'observation',pattern:'specific_observation',text:'神舟二十四号乘组进驻天宫，中外航天员的握手成为报道中的具体场景。',reason:'呈现已保存的具体动作。'},{id:'context',pattern:'context',text:'握手场景被放在国际合作的叙事中理解，具体背景仍应结合原始材料。',reason:'补充叙事背景。'}],selectedPostId:'observation',replies:[],altText:'WcCAT话题卡，介绍天宫中的中外航天员握手，并展示保存的个人支持评论。'}
 };
}
