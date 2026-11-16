/** Exact arithmetic shared by quantity, ratio and magnitude adapters. No floating-point rounding. */
export type Fraction = { numerator: bigint; denominator: bigint };
export function fraction(numerator: bigint, denominator = 1n): Fraction {
 if(!denominator)throw new Error('Zero denominator');
 if(denominator<0n){numerator=-numerator;denominator=-denominator;}
 let a=numerator<0n?-numerator:numerator,b=denominator;
 while(b){const rest=a%b;a=b;b=rest;}
 const divisor=a||1n;return {numerator:numerator/divisor,denominator:denominator/divisor};
}
export const multiply=(a:Fraction,b:Fraction)=>fraction(a.numerator*b.numerator,a.denominator*b.denominator);
export const divide=(a:Fraction,b:Fraction)=>fraction(a.numerator*b.denominator,a.denominator*b.numerator);
export const numberKey=(value:Fraction)=>`${value.numerator}/${value.denominator}`;
const digits:Record<string,string>={零:'0',〇:'0',一:'1',二:'2',两:'2',三:'3',四:'4',五:'5',六:'6',七:'7',八:'8',九:'9'};
export const chineseDigits='零〇一二两三四五六七八九十百千万亿';
export const chinesePattern=`[${chineseDigits}]+(?:点[零〇一二两三四五六七八九]+)?`;
const scales:Record<string,bigint>={万亿:1000000000000n,亿:100000000n,万:10000n,千:1000n,百:100n,trillion:1000000000000n,billion:1000000000n,million:1000000n,thousand:1000n,hundred:100n,k:1000n,m:1000000n,b:1000000000n};
export const scalarPattern='\\d+(?:[,，]\\d{3})*(?:\\.\\d+)?';
export const scalePattern='万亿|亿|万|千|百|trillion\\b|billion\\b|million\\b|thousand\\b|hundred\\b|[kmb]\\b';
export const scaledPattern=`(${scalarPattern})\\s*(${scalePattern})?`;
export function decimal(text:string):Fraction {
 const clean=text.replace(/[,，]/g,'');
 if(!/^\d+(?:\.\d+)?$/.test(clean))throw new Error('Invalid decimal');
 const [whole,part='']=clean.split('.');return fraction(BigInt(whole+part),10n**BigInt(part.length));
}
export function scaledNumber(value:string,scale?:string):Fraction{return multiply(decimal(value),fraction(scales[scale?.toLowerCase()??'']??1n));}
function chineseInteger(text:string):bigint {
 if(!text)return 0n;
 if([...text].every(c=>c in digits))return BigInt([...text].map(c=>digits[c]).join(''));
 for(const [unit,scale] of [['亿',100000000n],['万',10000n]] as const){
  const at=text.indexOf(unit);if(at>=0)return (chineseInteger(text.slice(0,at))||1n)*scale+chineseInteger(text.slice(at+1));
 }
 const units:Record<string,bigint>={十:10n,百:100n,千:1000n};let sum=0n,digit=0n;
 for(const c of text){if(c in digits)digit=BigInt(digits[c]);else if(c in units){sum+=(digit||1n)*units[c];digit=0n;}else throw new Error('Invalid Chinese numeral');}
 return sum+digit;
}
export function chineseNumber(text:string):Fraction {
 const [whole,part]=text.split('点');
 if(!part)return fraction(chineseInteger(whole));
 const places=[...part].map(c=>digits[c]);if(places.some(c=>c===undefined))throw new Error('Invalid Chinese decimal');
 const denominator=10n**BigInt(part.length);return fraction(chineseInteger(whole)*denominator+BigInt(places.join('')),denominator);
}
export function literalNumber(text:string):Fraction{return /^\d/.test(text)?decimal(text):chineseNumber(text);}
export function chineseToDigits(text:string):string {
 const value=chineseNumber(text);if(value.denominator===1n)return String(value.numerator);
 // A Chinese decimal always has a finite decimal expansion.
 const places=(text.split('点')[1]??'').length;
 const scale=10n**BigInt(places),raw=String(value.numerator*scale/value.denominator).padStart(places+1,'0');
 return raw.slice(0,-places)+'.'+raw.slice(-places);
}
const englishSmall:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const wordPattern=Object.keys(englishSmall).concat(['hundred','thousand','million','billion','trillion']).join('|');
/** Cardinal words are parsed as one expression, so "one million two hundred thousand" is 1,200,000. */
export function normalizeNumberWords(text:string):string {
 text=text.normalize('NFKC').replace(/成千上万|成百上千|千千万万/g,'');
 text=text.replace(/\bon the one hand\b|\bone another\b/gi,'');
 text=text.replace(new RegExp(`第(${chinesePattern})(?=[季届期集章回名位])`,'g'),(_,value:string)=>'第'+chineseToDigits(value));
 // Context, rather than every numeral-shaped character: 人生一串 / 千万不要 / 一带一路 are names or idioms.
 text=text.replace(new RegExp(`(${chinesePattern})(?=(?:个|位|名)?(?:人|岁|年|月|日|号|天|小时|分钟|秒|元|美元|欧元|港元|公里|千米|米|吨|公斤|斤|光日|成|分之))`,'g'),value=>chineseToDigits(value));
 text=text.replace(/(?<![\d数几零〇一二两三四五六七八九十百千万亿])([零〇一二两三四五六七八九十百千万亿]*[十百千万亿][零〇一二两三四五六七八九十百千万亿]*)(?=(?:余|多)?(?:粉丝|用户|播放|热度|[，。；：！？、,.!?;:]|$))/g,value=>chineseToDigits(value));
 const words=new RegExp(`\\b(?:${wordPattern})(?:[ -]+(?:(?:and)[ -]+)?(?:${wordPattern}))*\\b`,'gi');
 return text.replace(words,(value:string,offset:number,full:string)=>{
  // In "3.47 million", million belongs to the preceding decimal token.
  if(value.toLowerCase() in scales && /\d\s*$/.test(full.slice(0,offset)))return value;
  // Numerals embedded in a named compound (Three-Body, One-Piece) are not automatically quantities.
  const suffix=full.slice(offset+value.length);
  if(/^-[a-z]/i.test(suffix)&&!/^-(?:year|month|day|hour|minute|second|third|quarter|half)/i.test(suffix))return value;
  let total=0n,section=0n;
  for(const word of value.toLowerCase().split(/[ -]+/)){
   if(word==='and')continue;
   if(word in englishSmall)section+=BigInt(englishSmall[word]);
   else if(word==='hundred')section=(section||1n)*100n;
   else{total+=(section||1n)*scales[word];section=0n;}
  }
  return String(total+section);
 });
}
