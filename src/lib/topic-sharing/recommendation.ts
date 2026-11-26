import {visibleCommentQuotes} from '../comments/selection';
import {topicEvidenceTexts} from './evidence';
import type {EditorialColumn,TopicRecommendation,TopicShareLanguage,TopicShareSource} from './types';

/** Original comments remain usable when their saved English translation is missing. */
export function usableTopicQuotes(source:TopicShareSource,language:TopicShareLanguage) {
 const examples=source.commentExamples??source.analysis?.commentExamples,battle=source.analysis?.battle;
 const en=visibleCommentQuotes(examples,battle,'en',{allowMixedEnglish:true});
 const zh=visibleCommentQuotes(examples,battle,'zh');
 return language==='zh'?zh:en.filter(item=>zh.some(other=>other.quote.id===item.quote.id));
}
function topicKind(source:TopicShareSource){
 const text=[source.title,...source.categories].join(' '),material=topicEvidenceTexts(source).join(' '),all=text+' '+material;
 // Distribution platforms and publisher names identify where a story appeared, not its subject.
 const subjectMaterial=material.replace(/[^，,。；;]*(?:等平台(?:推送|传播|分发|转载)|等来源获得注意力)[^，,。；;]*/gu,' ').replace(/腾讯新闻|腾讯网|Tencent News|新浪新闻|新浪微博|网易新闻|虎嗅24小时/giu,'');
 const subjects=source.title+' '+subjectMaterial;
 const business=source.categories.some(category=>/business|finance|economy|财经|商业|产业|消费/i.test(category));
 const techEntity=/英伟达|黄仁勋|华为|小米|雷军|比亚迪|特斯拉|宁德时代|阿里巴巴|腾讯|字节跳动|抖音公司|中芯国际|台积电|\b(?:nvidia|jensen huang|huawei|xiaomi|byd|tesla|catl|tencent|alibaba|bytedance|tsmc|openai|deepseek)\b/i.test(subjects)||(/苹果|\bapple\b/i.test(subjects)&&(business||/手机|iPhone|iPad|MacBook|iOS|芯片|科技|发布会|市值/i.test(subjects)));
 const creator=/影视飓风|UP主|创作者|粉丝问答|粉丝.{0,8}Q\s*&?\s*A|\bBilibili creator\b/i.test(source.title+' '+material);
 const community=/猫\s*meme|二创|鬼畜|弹幕|粉丝问答|创作者社区|视频社区|\b(?:meme|fandom|remix|danmaku)\b/i.test(all)||creator;
 return {
  tech:techEntity||/科技|技术|数码|芯片|人工智能|机器人|电池|汽车|新能源|消费电子|手机|电商|\b(?:tech|technology|ai|ev|cars?|consumer|smartphone|chips?|automotive|digital)\b/i.test(text)||(business&&/厂商|公司.{0,8}(?:产品|设备|技术)|芯片|新能源|科技产品/i.test(material)),
  culture:community||/文化|网络用语|热梗|\b(?:culture|meme|slang)\b|(?:^|\s)梗(?:\s|$)/i.test(text+' '+material),
  life:/生活|社区服务|教育|健康|住房|就业|\b(?:life|lifestyle|everyday)\b/i.test(text),
  verify:/震惊|全网|全球|所有人|爆了|疯了|逆天|辞职|被捕|破产|世界第一|宠物.{0,8}(?:米线|底线)|米线|\b(?:everyone|shocking|unbelievable|resigns?|bankrupt)\b/i.test(source.title),
  creator,community,techEntity,business,
  crossBorder:/出海|海外|跨境|出口|全球市场|国际市场|\b(?:overseas|cross.border|exports?|international market)\b/i.test(all)
 };
}
type EditorialAudience={commentLanguage?:'en'|'zh'};
function editorialQuotes(source:TopicShareSource,audience:EditorialAudience){
 if(audience.commentLanguage!=='en')return usableTopicQuotes(source,'zh');
 // The separate daily-English workflow retains its existing column selection.
 const examples=source.commentExamples??source.analysis?.commentExamples;
 const originals=new Set(usableTopicQuotes(source,'zh').map(item=>item.quote.id));
 return visibleCommentQuotes(examples,source.analysis?.battle,'en').filter(item=>/[a-z]/i.test(item.text)&&originals.has(item.quote.id));
}
export function eligibleColumns(source:TopicShareSource,audience:EditorialAudience={}):EditorialColumn[] {
 return ['inside',...(editorialQuotes(source,audience).length?['voices' as const]:[]),...(topicKind(source).tech?['tech' as const]:[])] as EditorialColumn[];
}
export function recommendTopic(source:TopicShareSource,audience:EditorialAudience={}):TopicRecommendation {
 const kind=topicKind(source),quotes=editorialQuotes(source,audience),evidence=topicEvidenceTexts(source);
 const hasAnalysis=evidence.length>0;
 const evidenceLevel=quotes.length?'comments':hasAnalysis?'analysis':'headline';
 const column:EditorialColumn=quotes.length?'voices':kind.tech&&!kind.creator?'tech':'inside';
 const evidencePoints=evidenceLevel==='comments'?30:hasAnalysis?20:0;
 const rankPoints=Number.isFinite(source.rank)?Math.max(0,6-Math.max(1,source.rank)):0;
 const base=30+evidencePoints+rankPoints+(source.links.length?5:0)-(kind.verify?14:0);
 const score=(extra:number)=>Math.max(0,Math.min(hasAnalysis||quotes.length?95:32,Math.round(base+extra)));
 const warnings:string[]=[];
 if(evidenceLevel==='headline')warnings.push('仅有标题材料：事实和背景不足，先补充核实，降低编辑优先级。');
 if(!quotes.length)warnings.push('尚未保存可展示的原始评论，该栏目目前只能生成正文草稿，请自行核对。');
 if(quotes.length>usableTopicQuotes(source,'en').length)warnings.push('部分原始评论尚无可展示的英文译文，不影响正文生成；英文卡片会暂时省略该条。');
 if(kind.verify)warnings.push('标题含需要核实的重大主张、夸张表述或梗；核对原文与事件状态，不能按字面扩大解读。');
 const subject=`「${source.title.slice(0,120)}」`,anchor=evidence[0];
 const savedAngle=anchor?`材料切口：${anchor.replace(/\s+/g,' ').slice(0,150)}`:'目前只有标题，先补可核实的具体信息。';
 const englishAngle=column==='voices'?`围绕${subject}，给英文读者补足事件背景，再解释已保存个人评论的具体表达；不把样本外推为总体意见。`:column==='tech'?`围绕${subject}，先说明材料所指的人物、公司或产品，再核对具体变化与待确认部分；不推断动因或全球影响。`:kind.creator?`围绕${subject}，给英文读者解释创作者、粉丝问答与视频社区场景，区分标题悬念和材料已经确认的安排。`:kind.culture||kind.verify?`围绕${subject}，解释原词、场景与文化语用；梗 / meme 的字面意思和重复传播都需核实。`:`围绕${subject}，给不了解事件的英文读者补足人物、发生了什么与材料限制，先核对基本事实。`;
 const chineseAngle=column==='voices'?`围绕${subject}，从保存的个人评论读具体态度与措辞，不强凑反方。`:column==='tech'?`围绕${subject}，先核对报道状态、具体安排和材料中的实际影响，区分计划与落地。`:kind.life?`围绕${subject}，从日常使用、生活变化与具体条件切入，不扩大材料未说明的影响。`:kind.creator?`围绕${subject}，比较保存标题与简介的限定说法，讲清粉丝问答场景和仍未说明的安排。`:`围绕${subject}，从具体事件和中文语境解释讨论切口，保留尚未确认的信息。`;
 const englishExtra=(kind.tech&&!kind.creator?18:kind.culture?18:kind.life?6:5)+(kind.techEntity?9:0)+(kind.community?6:0)+(kind.business?4:0)+(kind.crossBorder?6:0);
 const chineseExtra=(kind.tech&&!kind.creator?12:kind.life?15:kind.culture?8:7)+(kind.life?5:0)+(kind.business?2:0)+(kind.community?2:0);
 const englishCues=[kind.techEntity?'recognizable technology company/person clues':kind.tech?'a concrete technology/consumer angle':'',kind.community?'creator/community context to explain':kind.culture?'cultural meaning to translate':'',kind.business?'a saved business category':'',kind.crossBorder?'an explicit cross-border cue in saved material':'',kind.life?'everyday relevance':''].filter(Boolean).join('; ')||'a source-grounded attention story';
 return {
  column,evidenceLevel,warnings,
  english:{score:score(englishExtra),reason:`Editorial priority only, not a viral probability: ${subject}; ${evidenceLevel==='comments'?'saved attributed comment evidence':hasAnalysis?'saved explanatory material':'headline evidence only'}; ${englishCues}${kind.verify?'; headline claim requires verification':''}.`,angle:englishAngle+' '+savedAngle},
  chinese:{score:score(chineseExtra),reason:`编辑优先级，不是爆款概率：${subject}；${evidenceLevel==='comments'?'有可追溯的双语个人评论':hasAnalysis?'有已保存的事实与背景材料':'仅有标题，材料不足'}；${kind.life?'日常生活关联较直接':kind.creator?'有创作者与粉丝社区的具体语境':kind.tech?'可说明人物、公司或产品的具体变化':kind.culture?'需要解释文化表达与使用场景':'需讲清具体事件'}${kind.business?'；商业类别提供辅助线索':''}${kind.verify?'；标题主张仍需核实':''}。`,angle:chineseAngle+' '+savedAngle}
 };
}
