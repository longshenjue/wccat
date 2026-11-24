type EvidenceSource={title:string;summary?:string;detail?:string;context?:string;analysis?:{summary?:string;detailedContent?:string;outsiderContext?:string}};
const compact=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,'');
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const localTemplates=[
 '它跨平台出现，说明这不是单一社区的短暂噪音，而是正在进入更广泛的中文互联网注意力场。',
 '它在单一平台排名靠前，适合作为该社区当日兴趣与情绪的信号。',
 '对不了解中文互联网的读者来说，这个话题需要结合平台来源理解：搜索热度代表求证需求，社交热度代表情绪扩散，媒体热度代表公共叙事进入。',
 '它在过去 24 小时持续出现在榜单中，适合作为日更内容的主线素材。'
].map(compact);

/** Known local ranking templates add no event facts, including when copied into local-rules analysis. */
export function topicEvidenceTexts(source:EvidenceSource):string[] {
 const title=compact(source.title),prefix=escape(title);
 const templates=[new RegExp(prefix+'正在[^。]*?等来源获得注意力[。.]?','gu'),new RegExp(prefix+'是过去24小时的高频中文互联网话题[。.]?','gu'),/这个话题来自[^。]*?可先从原始链接理解中文用户的表达方式、梗和争议点[。.]?/gu];
 const values=[source.summary,source.detail,source.context,source.analysis?.summary,source.analysis?.detailedContent,source.analysis?.outsiderContext];
 return [...new Set(values.filter((value):value is string=>{
  if(typeof value!=='string'||!value.trim())return false;
  let rest=compact(value);for(const template of localTemplates)rest=rest.replaceAll(template,'');
  for(const template of templates)rest=rest.replace(template,'');
  return rest!==title&&/[\p{L}\p{N}]/u.test(rest);
 }).map(value=>value.trim()))];
}
