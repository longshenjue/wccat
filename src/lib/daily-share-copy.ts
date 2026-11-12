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
  function validate(candidate: unknown, source: unknown, key = ''): unknown {
    if (typeof source === 'string') {
      if (typeof candidate !== 'string') throw new Error(`Missing translation: ${key}`);
      if (key === 'id' || key === 'sourceId') {
        if (candidate !== source) throw new Error(`Changed identity: ${key}`);
        return source;
      }
      const text = candidate.trim();
      if ((source.trim() && !text) || /\p{Script=Han}/u.test(text)) {
        throw new Error(`Incomplete English translation: ${key}`);
      }
      if (JSON.stringify(numericalFacts(source)) !== JSON.stringify(numericalFacts(text))) {
        throw new Error(`Changed numerical facts: ${key}`);
      }
      return text;
    }
    if (Array.isArray(source)) {
      if (!Array.isArray(candidate) || candidate.length !== source.length) throw new Error(`Incomplete list: ${key}`);
      return source.map((item, index) => validate(candidate[index], item, key));
    }
    if (source && typeof source === 'object') {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Missing object: ${key}`);
      const record = candidate as Record<string, unknown>;
      return Object.fromEntries(Object.entries(source).filter(([, item]) => item !== undefined)
        .map(([field, item]) => [field, validate(record[field], item, field)]));
    }
    return source;
  }
  return validate(value, original) as DailyShareCopy;
}

/** Compare quantities while allowing English month names, digit grouping and magnitude units. */
function numericalFacts(text: string): number[] {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';
  const monthNumber = (month: string) => months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  const normalized = text
    .replace(new RegExp(`\\b${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'),
      (_, month: string, day: string, year: string) => `${year}-${monthNumber(month)}-${day}`)
    .replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthPattern}\\s*,?\\s*(\\d{4})\\b`, 'gi'),
      (_, day: string, month: string, year: string) => `${year}-${monthNumber(month)}-${day}`);
  const scales: Record<string, number> = {'万亿': 1e12, '亿': 1e8, '万': 1e4, '千': 1e3, '百': 1e2, trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3, hundred: 1e2, k: 1e3, m: 1e6, b: 1e9};
  return [...normalized.matchAll(/(\d+(?:[,，]\d{3})*(?:\.\d+)?)\s*(万亿|亿|万|千|百|trillion\b|billion\b|million\b|thousand\b|hundred\b|[kmb]\b)?/gi)]
    .map((match) => Number(match[1].replace(/[,，]/g, '')) * (scales[match[2]?.toLowerCase()] ?? 1))
    .sort((left, right) => left - right);
}

export function getDailyShareCopy(report: WccatDailyReport, language: ShareLanguage): DailyShareCopy {
  if (language === 'zh') return buildDailyShareCopy(report);
  if (!report.shareEnglish) throw new Error('英文版尚未生成，请稍后再试。');
  return validateShareTranslation(report.shareEnglish, buildDailyShareCopy(report));
}
