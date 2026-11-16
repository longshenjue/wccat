import {numericalFacts,sameNumericalFacts} from './translation-facts';
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

export type NumericalWarning = {path:string;source:string;translated:string};
export type TranslationValidationOptions = {
  /** Production favors a usable translation; strict comparison remains available for diagnostics. */
  numerical?:'warn'|'strict';
  onNumericalWarning?:(warning:NumericalWarning)=>void;
};

export function validateShareTranslation(value: unknown, original: DailyShareCopy, options:TranslationValidationOptions = {}): DailyShareCopy {
  const warnings:NumericalWarning[]=[];
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
      try {
        const sourceFacts = numericalFacts(source);
        const translatedFacts = numericalFacts(text);
        if (!sameNumericalFacts(sourceFacts, translatedFacts)) {
          if(options.numerical==='strict')throw new Error(`Changed numerical facts: ${path} (expected ${JSON.stringify(sourceFacts)}, received ${JSON.stringify(translatedFacts)})`);
          warnings.push({path,source,translated:text});
        }
      } catch(error) {
        if(options.numerical==='strict')throw error;
        warnings.push({path,source,translated:text});
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
  const result=validate(value, original) as DailyShareCopy;
  // Emit only after structural validation succeeds: a rejected draft was never accepted.
  for(const warning of warnings)options.onNumericalWarning?.(warning);
  return result;
}

export function getDailyShareCopy(report: WccatDailyReport, language: ShareLanguage): DailyShareCopy {
  if (language === 'zh') return buildDailyShareCopy(report);
  if (!report.shareEnglish) throw new Error('英文版尚未生成，请稍后再试。');
  return validateShareTranslation(report.shareEnglish, buildDailyShareCopy(report));
}
