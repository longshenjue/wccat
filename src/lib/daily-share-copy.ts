import type { DailyReportTopic, WccatDailyReport } from './daily-report';
import type { TopicAnalysis } from './topic-analysis';

export type ShareLanguage = 'zh' | 'en';
export type ShareAnalysisCopy = Pick<TopicAnalysis, 'summary' | 'detailedContent' | 'outsiderContext' | 'changeReason'> & {
  battle: Pick<TopicAnalysis['battle'], 'redLabel' | 'blueLabel' | 'redRationale' | 'blueRationale'>;
  platformAnalyses: Array<Pick<TopicAnalysis['platformAnalyses'][number], 'sourceId' | 'sourceName' | 'attitude' | 'evidence'>>;
};
export type DailyShareCopy = {
  headline: string;
  overview: string;
  topics: Array<Pick<DailyReportTopic, 'id' | 'title' | 'oneLine' | 'whyItMatters' | 'sources'>>;
  analysis?: ShareAnalysisCopy;
};

export function buildDailyShareCopy(report: WccatDailyReport): DailyShareCopy {
  const analysis = report.topics[0]?.aiAnalysis;
  return {
    headline: report.headline,
    overview: report.overview,
    topics: report.topics.slice(0, 10).map(({ id, title, oneLine, whyItMatters, sources }) => ({id, title, oneLine, whyItMatters, sources})),
    analysis: analysis ? {
      summary: analysis.summary,
      detailedContent: analysis.detailedContent,
      outsiderContext: analysis.outsiderContext,
      changeReason: analysis.changeReason,
      battle: {
        redLabel: analysis.battle.redLabel,
        blueLabel: analysis.battle.blueLabel,
        redRationale: analysis.battle.redRationale,
        blueRationale: analysis.battle.blueRationale
      },
      platformAnalyses: analysis.platformAnalyses.map(({sourceId, sourceName, attitude, evidence}) => ({sourceId, sourceName, attitude, evidence}))
    } : undefined
  };
}

export function validateShareTranslation(value: unknown, original: DailyShareCopy): DailyShareCopy {
  function validate(candidate: unknown, source: unknown, key = '', path = ''): unknown {
    if (typeof source === 'string') {
      if (typeof candidate !== 'string') throw new Error(`Missing translation: ${path}`);
      if (key === 'id' || key === 'sourceId') {
        if (candidate !== source) throw new Error(`Changed identity: ${path}`);
        return source;
      }
      const text = candidate.trim();
      if ((source.trim() && !text) || /\p{Script=Han}/u.test(text)) {
        throw new Error(`Incomplete English translation: ${path}`);
      }
      const sourceFacts = numericalFacts(source);
      const translatedFacts = numericalFacts(text);
      if (JSON.stringify(sourceFacts) !== JSON.stringify(translatedFacts)) {
        throw new Error(`Changed numerical facts: ${path} (expected ${JSON.stringify(sourceFacts)}, received ${JSON.stringify(translatedFacts)})`);
      }
      return text;
    }
    if (Array.isArray(source)) {
      if (!Array.isArray(candidate) || candidate.length !== source.length) throw new Error(`Incomplete list: ${path}`);
      return source.map((item, index) => validate(candidate[index], item, key, `${path}[${index}]`));
    }
    if (source && typeof source === 'object') {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Missing object: ${path}`);
      const record = candidate as Record<string, unknown>;
      return Object.fromEntries(Object.entries(source).filter(([, item]) => item !== undefined)
        .map(([field, item]) => [field, validate(record[field], item, field, path ? `${path}.${field}` : field)]));
    }
    return source;
  }
  return validate(value, original) as DailyShareCopy;
}

/** Compare explicit quantities, including localized dates, season numbers and Chinese magnitudes. */
function numericalFacts(text: string) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';
  const monthNumber = (month: string) => months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  const dayPattern = '(\\d{1,2})(?:st|nd|rd|th)?';
  const yearSuffix = '(?:,\\s*|\\s+(?:(?:in|of)\\s+)?)(\\d{4})\\b';
  const rangeSeparator = '\\s*(?:[-–—−]|to\\b|through\\b|and\\b)\\s*';
  const normalized = text
    .replace(/成千上万|成百上千|千千万万/g, '')
    .replace(/第([零〇一二两三四五六七八九十百千万亿]+)(?=[季届期集章回])/g,
      (_, number: string) => '第'+chineseInteger(number))
    // Only explicit magnitudes; titles and idioms must not add numerical facts.
    .replace(/(?<![\d数几零〇一二两三四五六七八九十百千万亿])([零〇一二两三四五六七八九十百千万亿]*[十百千万亿][零〇一二两三四五六七八九十百千万亿]*)(?=(?:余|多)?(?:人|次|元|粉丝|用户|播放|热度|[，。；：！？、,.!?;:]|$))/g,
      (_, number: string) => String(chineseInteger(number)))
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
  const scales: Record<string, number> = {'万亿': 1e12, '亿': 1e8, '万': 1e4, '千': 1e3, '百': 1e2, trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3, hundred: 1e2, k: 1e3, m: 1e6, b: 1e9};
  const numbers = [...normalized.matchAll(/(\d+(?:[,，]\d{3})*(?:\.\d+)?)\s*(万亿|亿|万|千|百|trillion\b|billion\b|million\b|thousand\b|hundred\b|[kmb]\b)?/gi)]
    .map((match) => Number(match[1].replace(/[,，]/g, '')) * (scales[match[2]?.toLowerCase()] ?? 1))
    .sort((left, right) => left - right);
  // Keep roles as well as quantities: Season 4 / Episode 2 must not match
  // Season 2 / Episode 4, nor November 12 match December 11.
  const seasons = [...normalized.matchAll(/第(\d+)季|\bseason\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+season\b/gi)]
    .map((match) => Number(match[1] ?? match[2] ?? match[3])).sort((a,b)=>a-b);
  const dates = [...normalized.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/g)]
    .map((match) => `${match[1] ?? ''}-${Number(match[2])}-${Number(match[3])}`).sort();
  return {numbers, seasons, dates};
}

function chineseInteger(text: string): number {
  for (const [unit, scale] of [['亿', 1e8], ['万', 1e4]] as const) {
    const index = text.indexOf(unit);
    if (index >= 0) return (chineseInteger(text.slice(0, index)) || 1) * scale + chineseInteger(text.slice(index + 1));
  }
  const digits: Record<string, number> = {零:0, 〇:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9};
  const units: Record<string, number> = {十:10, 百:100, 千:1000};
  let total = 0;
  let digit = 0;
  for (const character of text) {
    if (character in digits) digit = digits[character];
    else if (character in units) {
      total += (digit || 1) * units[character];
      digit = 0;
    }
  }
  return total + digit;
}

export function getDailyShareCopy(report: WccatDailyReport, language: ShareLanguage): DailyShareCopy {
  if (language === 'zh') return buildDailyShareCopy(report);
  if (!report.shareEnglish) throw new Error('英文版尚未生成，请稍后再试。');
  return validateShareTranslation(report.shareEnglish, buildDailyShareCopy(report));
}
