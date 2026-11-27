/** Generation-only cleanup; manual edits and original quotations are never passed here. */
const diagnostics=/(?:现有|现存|所给|手头|保存的|原始|原|本次检索到的|提供的|所提供的)(?:新闻)?(?:材料|资料|信息|报道|内容|描述|来源|证据).{0,36}(?:没(?:有|能)|未(?:给|提|说明|提供|取得)|缺|不足|无法核实)|(?:但|仍|尚|还)?缺(?:少|乏)?(?:具体|相关|必要|可靠|可核实|有效)?(?:数据|资料|证据|信息|来源).{0,8}(?:佐证|支撑|支持|核实)|(?:从现有|从|仅从)榜单信号看|\b(?:the )?(?:saved|supplied|provided|available|source) (?:material|sources?|information|evidence|reporting) (?:does not|do not|lacks?|contains? no|provides? no|is insufficient)|\b(?:our|this) (?:search|retrieval) (?:found no|did not)/iu;
export function hasNewsroomDiagnostics(value:string):boolean{return diagnostics.test(value);}
export function cleanGeneratedNewsText(value:string):string {
 if(!hasNewsroomDiagnostics(value))return value;
 return value.split(/(?<=[。！？.!?])(?=\s|[^\x00-\x7f])|\n/gu).filter(part=>!hasNewsroomDiagnostics(part)).join('\n').replace(/。\n(?=[^\x00-\x7f])/g,'。').trim();
}
const publicFields=new Set(['headline','title','overview','wechatDraft','videoScript','hook','summary','detailedContent','outsiderContext','editorialTake','context','whyItMatters','question','altText','body','text','replies','whatHappened','redRationale','blueRationale','redLabel','blueLabel']);
export function cleanGeneratedNewsValue(value:unknown,key='',depth=0):unknown {
 if(depth>12)return value;
 if(typeof value==='string')return publicFields.has(key)?cleanGeneratedNewsText(value):value;
 if(Array.isArray(value))return value.map(row=>cleanGeneratedNewsValue(row,key,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,row])=>[field,cleanGeneratedNewsValue(row,field,depth+1)]));
 return value;
}
