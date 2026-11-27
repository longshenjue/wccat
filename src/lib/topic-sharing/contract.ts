import type {TopicShareLanguage} from './types';

export const TOPIC_SHARE_POST_PATTERNS=['specific_observation','source_voice','number_context','bounded_counterpoint','culture_translation','sourced_update','context','uncertainty','editorial_take'] as const;
export const TOPIC_NEWS_POLICY='news-commentary-v2' as const;
export type TopicTextLimit={maxChars:number;maxWords?:number};
export const TOPIC_SHARE_CONTRACT={
 postCount:3,maxReplies:4,
 en:{headline:{maxChars:200,maxWords:18},hook:{maxChars:280},summary:{maxChars:1200,maxWords:70},context:{maxChars:1200,maxWords:70},whyItMatters:{maxChars:800,maxWords:45},question:{maxChars:280},post:{maxChars:280},reply:{maxChars:1000},altText:{maxChars:1000},reason:{maxChars:400}},
 zh:{headline:{maxChars:45},hook:{maxChars:140},summary:{maxChars:200},context:{maxChars:220},whyItMatters:{maxChars:150},question:{maxChars:140},post:{maxChars:140},reply:{maxChars:1000},altText:{maxChars:1000},reason:{maxChars:400}}
} as const;

/** The prompt, strict validator and repair request consume these same budgets. */
export function topicShareFieldLimit(path:string):TopicTextLimit&{language?:TopicShareLanguage;allowedValues?:readonly string[]} {
 const [language,field]=path.split('.');
 if(language!=='en'&&language!=='zh')throw new Error('Unknown public copy field');
 const limits=TOPIC_SHARE_CONTRACT[language];
 if(field==='article')return path.endsWith('.title')?{maxChars:220,language}:{maxChars:14000,maxWords:language==='en'?1600:undefined,language};
 if(field==='attitudes')return {maxChars:120,maxWords:language==='en'?12:undefined,language};
 if(/^posts\[\d+\]$/u.test(field)){
  if(path.endsWith('.text'))return {...limits.post,language};
  if(path.endsWith('.reason'))return {...limits.reason};
  if(path.endsWith('.pattern'))return {maxChars:80,allowedValues:TOPIC_SHARE_POST_PATTERNS};
 }
 if(/^replies\[\d+\]$/u.test(field))return {...limits.reply,language};
 if(field==='selectedPostId')return {maxChars:80};
 if(Object.hasOwn(limits,field)&&!['post','reply','reason'].includes(field))return {...limits[field as keyof typeof limits],language};
 throw new Error('Unknown public copy field');
}
