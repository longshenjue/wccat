import {chinesePattern, literalNumber, fraction, divide, multiply, numberKey, normalizeNumberWords, scaledNumber, scaledPattern, type Fraction} from './translation-numbers';

/** Numerical semantics are separate from JSON structure validation. Extend adapters here, not the report walker. */
type Bound='exact'|'approx'|'max'|'min'|'gt'|'lt';
type RatioFact={value:string;bound:Bound};
export type NumericalFacts={numbers:string[];ratios:RatioFact[];seasons:number[];dates:string[];roles:Record<string,string[]>};
const numberExpression=`(?:\\d+(?:\\.\\d+)?|${chinesePattern})`;
function boundAt(text:string,index:number,after=''):Bound {
 const before=text.slice(Math.max(0,index-60),index);
 if(/(?:不超过|至多|最多|no more than|at most|up to)\s*$/i.test(before)||/^\s*(?:or fewer|or less|以下|以内)/i.test(after))return 'max';
 if(/(?:不少于|不低于|至少|at least|no fewer than|no less than)\s*$/i.test(before)||/^\s*(?:or more|以上)/i.test(after))return 'min';
 if(/(?:超过|多于|高于|大于|上|more than|over|above)\s*$/i.test(before))return 'gt';
 if(/(?:不足|不到|少于|低于|小于|less than|under|below|fewer than)\s*$/i.test(before))return 'lt';
 if(/(?:大约|约|将近|近|大概|nearly|almost|about|roughly|approximately)\s*$/i.test(before))return 'approx';
 return 'exact';
}
function extractRatios(text:string) {
 const ratios:RatioFact[]=[];let remaining=text;
 const consume=(pattern:RegExp,read:(parts:string[])=>Fraction)=>{
  remaining=remaining.replace(pattern,(...args:unknown[])=>{
   const parts=args.slice(0,-2) as string[],index=args.at(-2) as number;
   const value=read(parts);
   ratios.push({value:numberKey(value),bound:boundAt(text,index,text.slice(index+parts[0].length))});
   return ' '.repeat(parts[0].length);
  });
 };
 consume(new RegExp(`(${numberExpression})分之(${numberExpression})`,'g'),m=>divide(literalNumber(m[2]),literalNumber(m[1])));
 consume(new RegExp(`(${numberExpression})成(${numberExpression})?`,'g'),m=>{
  const first=divide(literalNumber(m[1]),fraction(10n));
  if(!m[2])return first;
  const part=divide(literalNumber(m[2]),fraction(100n));
  return fraction(first.numerator*part.denominator+part.numerator*first.denominator,first.denominator*part.denominator);
 });
 // Consume compound fractions before the standalone "half of" expression.
 consume(/(\d+(?:\.\d+)?)\s*[- ](?:quarters?|thirds?|half|halves)\b/gi,m=>divide(literalNumber(m[1]),fraction(/quarter/i.test(m[0])?4n:/third/i.test(m[0])?3n:2n)));
 consume(/半数|一半|\bhalf\s+(?:of\s+|the\s+)/gi,()=>fraction(1n,2n));
 consume(/(\d+(?:\.\d+)?)\s+(?:out of|in)\s+(\d+(?:\.\d+)?)\b/gi,m=>divide(literalNumber(m[1]),literalNumber(m[2])));
 consume(/(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?\b|per cent\b)/gi,m=>multiply(literalNumber(m[1]),fraction(1n,100n)));
 return {remaining,ratios:ratios.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}

function normalizeDates(text:string):string {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';
  const monthNumber = (month: string) => months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  const dayPattern = '(\\d{1,2})(?:st|nd|rd|th)?';
  const yearSuffix = '(?:,\\s*|\\s+(?:(?:in|of)\\s+)?)(\\d{4})\\b';
  const rangeSeparator = '\\s*(?:[-–—−]|to\\b|through\\b|and\\b)\\s*';
  return text
    .replace(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g,
      (_, year: string, month: string, day: string) => year+'年'+Number(month)+'月'+Number(day)+'日')
    // Compact ranges must retain their trailing year before single dates are normalized.
    .replace(new RegExp('\\b'+monthPattern+'\\s+'+dayPattern+rangeSeparator+dayPattern+yearSuffix, 'gi'),
      (_, month: string, first: string, last: string, year: string) => year+'年'+monthNumber(month)+'月'+first+'日至'+last+'日')
    .replace(new RegExp('\\b'+dayPattern+rangeSeparator+dayPattern+'\\s+'+monthPattern+yearSuffix, 'gi'),
      (_, first: string, last: string, month: string, year: string) => year+'年'+monthNumber(month)+'月'+first+'日至'+last+'日')
    .replace(new RegExp('\\b'+monthPattern+'\\s+'+dayPattern+yearSuffix, 'gi'),
      (_, month: string, day: string, year: string) => year+'年'+monthNumber(month)+'月'+day+'日')
    .replace(new RegExp('\\b'+dayPattern+'\\s+'+monthPattern+yearSuffix, 'gi'),
      (_, day: string, month: string, year: string) => year+'年'+monthNumber(month)+'月'+day+'日')
    .replace(new RegExp('\\b'+monthPattern+'\\s+'+dayPattern+'\\b', 'gi'),
      (_, month: string, day: string) => monthNumber(month)+'月'+day+'日')
    .replace(new RegExp('\\b'+dayPattern+'\\s+'+monthPattern+'\\b', 'gi'),
      (_, day: string, month: string) => monthNumber(month)+'月'+day+'日');

}

export function numericalFacts(text:string):NumericalFacts {
 // Date ranges take precedence: "December 19 to 20 in 2026" is not a 20/2026 ratio.
 const normalizedWords=normalizeDates(normalizeNumberWords(text));
 const {remaining:normalized,ratios}=extractRatios(normalizedWords);
 const roles:Record<string,string[]>={};
 const numbers=[...normalized.matchAll(new RegExp(scaledPattern,'gi'))].map(match=>{
  const value=numberKey(scaledNumber(match[1],match[2]));
  const before=normalized.slice(0,match.index),after=normalized.slice(match.index!+match[0].length);
  let role:string|undefined;
  if(/^(?:岁|\s*-?year(?:s)?[- ]old\b)/i.test(after)||/\bage\s*:?\s*$/i.test(before))role='age';
  else if(/^(?:个|位|名)?人/.test(after)||/^\s*(?:people|persons?|individuals?)\b/i.test(after))role='people';
  else if(/^(?:元|\s*(?:yuan|CNY|RMB)\b)/i.test(after)||/\b(?:CNY|RMB)\s*$/i.test(before))role='money:CNY';
  else if(/^(?:美元|\s*(?:dollars?|USD)\b)/i.test(after)||/(?:\$|\bUSD)\s*$/i.test(before))role='money:USD';
  if(role)(roles[role]??=[]).push(value+':'+boundAt(normalized,match.index!,after));
  return value;
 }).sort();
 for(const values of Object.values(roles))values.sort();
 const seasons=[...normalized.matchAll(/第(\d+)季|\bseason\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+season\b/gi)].map(match=>Number(match[1]??match[2]??match[3])).sort((a,b)=>a-b);
 const dates=[...normalized.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/g)].map(match=>`${match[1]??''}-${Number(match[2])}-${Number(match[3])}`).sort();
 return {numbers,ratios,seasons,dates,roles};
}

/** Units may be implicit on one side; only assert a role contradiction when both sides identify that role. */
export function sameNumericalFacts(source:NumericalFacts,target:NumericalFacts):boolean {
 const core=({numbers,ratios,seasons,dates}:NumericalFacts)=>({numbers,ratios,seasons,dates});
 if(JSON.stringify(core(source))!==JSON.stringify(core(target)))return false;
 return Object.keys(source.roles).every(role=>!target.roles[role]||JSON.stringify(source.roles[role])===JSON.stringify(target.roles[role]));
}
