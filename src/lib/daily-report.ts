import {newsroomPrompt} from './newsroom/prompts';
import {cleanGeneratedNewsValue} from './newsroom/prose';
import {enrichDailyReporting} from './newsroom/daily-reporting';
import type {TopicResearch} from './topic-sharing/research/types';
import type {TopicPhoto,TopicReaderComment} from './topic-sharing/types';
import { getChinaSnapshotId } from "./date";
import {
  readDailyReportFromDb,
  readLatestDailyReportFromDb,
  readTopicAnalysesForDate,
  saveDailyReportToDb,
  saveAiAnalysisLogToDb,
  saveTopicAnalysisEvidenceToDb,
  writeGeneration
} from "./db";
import {groupNewsFacts,newsFactKey} from './news-facts';
import {topicIdFromTitle} from './normalize';
import {summarizeTopic} from './summary';
import { readDailyReportInput } from "./daily-report-input";
import { translateDailyShare } from "./daily-share-translation";
import type { DailyShareCopy } from "./daily-share-copy";
import type { ShareEnCopy } from "./shareen-types";
import {savePreparedShareEnImages} from './sharing';
import {restoreGeneratedImages} from './shareen-image-state';
import {generateShareEn} from "./shareen";
import {saveSharingFields} from "./shareen-persistence";
import { inferSentiment, sentimentLabel } from "./sentiment";
import { analyzeTopicWithDeepSeek, type TopicAnalysis } from "./topic-analysis";
import { fetchArticleContexts } from "./fulltext";
import {enrichDailyComments,reuseDailyComments} from './comments/daily';
import { redactJobMessage } from "./log-redaction";
import type { DailySnapshot, Sentiment, TopicGroup, TopicOccurrence } from "./types";
import {dailyCoverageSlot,dailyFactPeaks,dailyPlatformRank,dailyRankingEvidence,selectDailyCandidates,type DailyRankingEvidence,type DailyRankingObservation} from './daily-ranking';
import {getSourceById} from './sources';
import {platformItemKey,scorePlatformItems} from './platform-ranking';
import {planDailyStories} from './daily-story-planner';
import type {DailyStorySelection} from './daily-story-selection';

export type DailyReportTopic = {
  id: string;
  rank: number;
  title: string;
  dailyScore: number;
  rankingEvidence?: DailyRankingEvidence;
  peakRank: number;
  peakHeatScore: number;
  /** Legacy field: observation count, not elapsed hours. Retained for archived reports. */
  activeHours: number;
  sampleCount?: number;
  sampleCoverage?: number;
  sources: string[];
  categories: string[];
  sentiment: Sentiment;
  signal: "dominant" | "rising" | "long-tail";
  oneLine: string;
  whyItMatters: string;
  cover?: string;
  coverAttribution?:{pageUrl:string;publisher:string};
  coverSourceId?: string;
  aiAnalysis?: TopicAnalysis;
  research?:TopicResearch;photo?:TopicPhoto;readerComments?:TopicReaderComment[];assetWarnings?:string[];
  /** Distinct facts shown under one editorial storyline, not deduplicated away. */
  relatedDevelopments?: DailyReportTopic[];
  analysisSnapshotDate?: string;
  analysisTopicId?: string;
  links: Array<{
    sourceId: string;
    sourceName: string;
    title: string;
    url: string;
  }>;
};

export type WccatDailyReport = {
  reportDate: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  headline: string;
  overview: string;
  topics: DailyReportTopic[];
  wechatDraft: string;
  videoScript: string;
  model: string;
  shareEnglish?: DailyShareCopy;
  shareEn?: ShareEnCopy;
  storySelection?: DailyStorySelection;
  collection?: {observedUntil:string;complete:boolean;sampleCount:number;firstCollectedAt?:string;lastCollectedAt?:string};
};

type TopicBucket = {
  key: string;
  title: string;
  sentiment: Sentiment;
  topics: TopicGroup[];
  occurrences: TopicOccurrence[];
  snapshotDates: Set<string>;
  rankingObservations: DailyRankingObservation[];
  categories: Set<string>;
  peakHeatScore: number;
  peakRank: number;
  peakSnapshotDate?: string;
  peakTopicId?: string;
  latestSignal: TopicGroup['signal'];
};

type GeneratedDrafts = Pick<WccatDailyReport, "headline" | "overview" | "wechatDraft" | "videoScript" | "model">;
export type GenerationLog = (level: "info" | "warn" | "error", message: string) => void;

export async function generateDailyReport(inputDate = new Date(), options: {requireData?:boolean;log?:GenerationLog;observedUntil?:Date} = {}) {
  const log:GenerationLog = options.log ?? ((level,message)=>console[level]('[WcCAT] '+redactJobMessage(message)));
  const generation = writeGeneration();
  const { start, end, reportDate, snapshots, analyses, collection } = readDailyReportInput(inputDate, options.observedUntil ?? new Date());
  log('info', `开始生成 ${reportDate} 日报，统计窗口 ${getChinaSnapshotId(start)}:00 → ${getChinaSnapshotId(end)}:00 UTC+8`);
  if(!collection.complete)log('warn', `提前生成：统计窗口未结束，仅使用截至 ${collection.observedUntil} 的采样`);
  log('info', `已读取 ${snapshots.length} 次采样，正在汇总 Top10`);
  const sourceCoverage=new Map<string,Set<string>>();
  for(const snapshot of snapshots)for(const item of snapshot.rawItems){
    const dates=sourceCoverage.get(item.sourceId)??new Set<string>();dates.add(snapshot.date);sourceCoverage.set(item.sourceId,dates);
  }
  const coverageIds=new Set(['weibo','baidu','douyin','toutiao',...sourceCoverage.keys()]);
  log('info',`来源覆盖：${[...coverageIds].map(id=>`${getSourceById(id)?.displayName??id} ${sourceCoverage.get(id)?.size??0}/${snapshots.length}`).join('；')}`);
  const candidates = buildDailyCandidateTopics(snapshots,date=>analyses[date]??{});
  // Keep the full pool until editorial grouping has freed and refilled its slots.
  const {topics,selection:storySelection}=await planDailyStories(candidates,log);
  const previous=readDailyReportFromDb(reportDate);
  if(options.requireData && (!snapshots.length || !topics.length)) throw new Error('该统计窗口没有有效快照或话题，已有日报保持不变。');
  if(snapshots.length&&!topics.length)throw new Error('该窗口缺少符合综合日报规则的话题，已有日报保持不变。');
  log('info', `Top10 汇总完成：${topics.length} 个话题`);
  log('info',`排序依据 platform-tier-v3：跨平台 ${topics.filter(topic=>topic.rankingEvidence?.basis==='cross-platform').length} 条，单平台 ${topics.filter(topic=>topic.rankingEvidence?.basis==='single-platform').length} 条；互动仅作站内相对排名，各平台全天贡献不超过本档上限`);
  const top = topics[0];
  if (top && (!top.aiAnalysis || top.aiAnalysis.model === "local-rules") && top.analysisSnapshotDate) {
    const snapshot = snapshots.find(value=>value.date===top.analysisSnapshotDate);
    const original = snapshot?.topics.find((topic) => topic.id === top.analysisTopicId);
    if (original) {
      log('info', '正在补充 TOP1 AI 分析');
      const analysisDate=top.analysisSnapshotDate;
      let attemptId:string|undefined;
      top.aiAnalysis = await analyzeTopicWithDeepSeek(original, await fetchArticleContexts(original.occurrences),undefined,trace=>{
        attemptId=saveAiAnalysisLogToDb(analysisDate,original.id,trace,generation);
        log(trace.status==='ok'?'info':'warn', `TOP1 AI ${trace.model} ${trace.status}，耗时 ${trace.durationMs}ms，fallback=${trace.usedFallback}${trace.error?`：${trace.error}`:''}`);
      });
      saveTopicAnalysisEvidenceToDb(analysisDate,original.id,top.aiAnalysis,generation,snapshot?.evidenceRunIds,{topic:original,attemptId});
    }
  }
  if(top) log(top.aiAnalysis && top.aiAnalysis.model!=='local-rules'?'info':'warn', `TOP1 分析来源：${top.aiAnalysis?.model ?? '无分析'}${top.aiAnalysis?.model==='local-rules'?'（本地规则回退）':''}`);
  reuseDailyComments({reportDate,windowStart:getChinaSnapshotId(start),windowEnd:getChinaSnapshotId(end),topics},previous);
  // Historical regeneration reuses frozen evidence rather than collecting today's comments.
  if(Date.now()-end.getTime()<36*3600_000){
    await enrichDailyReporting(topics,reportDate,log);
    await enrichDailyComments(topics,log);
  }else log('info','历史日报沿用已保存评论证据，不重新抓取当前评论。');
  log('info', '正在生成中文日报稿件');
  const drafts = await generateDrafts(reportDate, snapshots, topics, {
    start: getChinaSnapshotId(start), end: getChinaSnapshotId(end),complete:collection.complete,observedUntil:collection.observedUntil
  },log);
  if(!collection.complete)drafts.overview='提前生成，统计窗口尚未结束。'+drafts.overview;
  const report: WccatDailyReport = {
    reportDate,
    generatedAt: new Date().toISOString(),
    windowStart: getChinaSnapshotId(start),
    windowEnd: getChinaSnapshotId(end),
    topics,
    storySelection,
    collection,
    ...drafts
  };

  saveDailyReportToDb(report, generation);
  log('info', `中文日报已保存，稿件模型：${report.model}`);
  log('info', '正在生成英文分享翻译');
  const shareEnglish = await translateDailyShare(report,log);
  if (shareEnglish) {
    if(!saveSharingFields(report,{shareEnglish},generation)) throw new Error('英文保存失败：日报或分享版本在翻译期间已改变，已保留最新版本。');
    report.shareEnglish=shareEnglish;
    log('info', '英文分享内容已保存');
  } else log('warn', '中文已生成，英文未就绪');
  log('info', '正在生成 ShareEn 海外分享卡片、情绪对抗条与焦点英文配文');
  const shareEn=await generateShareEn(report,log);
  if(shareEn){
    const withAssets=restoreGeneratedImages(report,shareEn,previous);
    if(!saveSharingFields(report,{shareEn:withAssets},generation))throw new Error('ShareEn 保存失败：日报在生成期间已改变，请重新生成。');
    report.shareEn=withAssets;
    log('info','ShareEn 文案已保存，正在检查焦点配图');
    const saved=await savePreparedShareEnImages(report,withAssets,generation,{log});
    report.shareEn=saved.shareEn;
  }else log('warn','日报已保存，ShareEn 暂未就绪，可在管理员“分享制作”重新生成');
  log('info', `日报生成结束：${reportDate}，${topics.length} 个话题`);
  return report;
}

export function getDailyReport(reportDate?: string) {
  if (reportDate) {
    return readDailyReportFromDb(reportDate);
  }

  return readLatestDailyReportFromDb();
}

export function buildDailyTopTopics(snapshots: DailySnapshot[],analysisReader=readTopicAnalysesForDate) {
  return buildDailyCandidateTopics(snapshots,analysisReader).slice(0,10);
}

export function buildDailyCandidateTopics(snapshots: DailySnapshot[],analysisReader=readTopicAnalysesForDate) {
  const observations:Array<{snapshotDate:string;topic:TopicGroup;occurrence:TopicOccurrence;analysisEligible:boolean}>=[];
  const snapshotDates = [...new Set(snapshots.map(snapshot => snapshot.date))].sort();
  // Normalize persistence weighting for hourly legacy data and four-hour samples.
  // This is a ranking weight, never an assertion of continuous elapsed activity.
  const sampleTimes = snapshotDates.map(date => Date.parse(`${date.slice(0, 10)}T${date.slice(11)}:00:00+08:00`));
  const gaps = sampleTimes.slice(1).map((time, index) => (time - sampleTimes[index]) / 3600000)
    .filter(gap => Number.isFinite(gap) && gap > 0).sort((a, b) => a - b);
  // Median cadence prevents one restart/manual sample from downweighting the entire day.
  const middle = Math.floor(gaps.length / 2);
  const medianGap = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  const sampleWeight = gaps.length ? Math.min(4, medianGap) : 1;

  const totalSlots=new Set(snapshotDates.map(dailyCoverageSlot)).size;
  const availableBySource=new Map<string,Set<string>>();
  for (const snapshot of snapshots) {
    // Recompute archived captures from raw rank/stat evidence, never from their old scores.
    const scored=scorePlatformItems([...snapshot.rawItems,...snapshot.topics.flatMap(topic=>topic.occurrences)]);
    const scoringByKey=new Map(scored.map(item=>[platformItemKey(item),item.platformScoring!]));
    for(const item of scored){
      const slots=availableBySource.get(item.sourceId)??new Set<string>();
      slots.add(dailyCoverageSlot(snapshot.date));availableBySource.set(item.sourceId,slots);
    }
    for (const topic of snapshot.topics) {
      // Old hourly fuzzy groups may contain more than one development. A saved
      // analysis is reusable only when its entire source group is one fact.
      const analysisEligible=groupNewsFacts([topic.title,...topic.occurrences.map(item=>item.title)],title=>title).length===1;
      for(const occurrence of topic.occurrences){
        const platformScoring=scoringByKey.get(platformItemKey(occurrence));
        if(!newsFactKey(occurrence.title)||!platformScoring||dailyPlatformRank(occurrence)===undefined)continue;
        observations.push({snapshotDate:snapshot.date,topic,analysisEligible,
          occurrence:{...occurrence,platformScoring,platformScore:platformScoring.cap*platformScoring.strength}});
      }
    }
  }

  // Deduplicate the full saved pool BEFORE sorting or taking Top10. Scores are
  // rebuilt from united observations, never by adding duplicate topic scores.
  const factGroups=groupNewsFacts(observations,value=>value.occurrence.title);
  const peaks=dailyFactPeaks(factGroups);
  const analysisCache = new Map<string, ReturnType<typeof readTopicAnalysesForDate>>();
  const savedAnalysis=(date:string,id:string)=>{
    if(!analysisCache.has(date))analysisCache.set(date,analysisReader(date));
    return analysisCache.get(date)?.[id];
  };
  const buckets=factGroups.map((group,index)=>{
    const finalTitles=[...new Set(group.map(value=>value.occurrence.title))];
    const eligibility=new Map<TopicGroup,boolean>();
    const candidates=group.map(value=>{
      // A locally coherent parent can still conflict with a singular authority
      // in the final group after a generic bridge was assigned elsewhere.
      if(!eligibility.has(value.topic))eligibility.set(value.topic,value.analysisEligible&&
        groupNewsFacts([...new Set([...finalTitles,value.topic.title,...value.topic.occurrences.map(item=>item.title)])],title=>title).length===1);
      const analysisEligible=eligibility.get(value.topic)!;
      const analysis=analysisEligible?savedAnalysis(value.snapshotDate,value.topic.id):undefined;
      return {...value,analysisEligible,analysisPriority:analysisEligible?(analysis&&analysis.model!=='local-rules'?2:1):0};
    });
    const lead=candidates.reduce((best,value)=>
      value.analysisPriority>best.analysisPriority||
      (value.analysisPriority===best.analysisPriority&&value.occurrence.platformScore>=best.occurrence.platformScore)?value:best);
    // An archived generic lead may describe several split groups. Always name a
    // group from an occurrence it actually contains, not that ambiguous lead.
    const title=lead.occurrence.title;
    const occurrences=group.map(value=>value.occurrence);
    const representative=lead.analysisEligible?lead.topic:{...lead.topic,title,summary:summarizeTopic(title,occurrences)};
    return {
      key:topicIdFromTitle(title),title,sentiment:inferSentiment(occurrences.map(item=>item.title).join(' ')),topics:[representative],occurrences,
      snapshotDates:new Set(group.map(value=>value.snapshotDate)),
      rankingObservations:group.map(({snapshotDate,occurrence})=>({snapshotDate,occurrence})),
      categories:new Set(occurrences.map(value=>value.sourceCategory)),
      ...peaks[index],
      peakSnapshotDate:lead.analysisEligible?lead.snapshotDate:undefined,
      peakTopicId:lead.analysisEligible?lead.topic.id:undefined
    } satisfies TopicBucket;
  });

  return selectDailyCandidates(buckets
    .map(bucket => toDailyReportTopic(bucket, snapshotDates.length, sampleWeight,totalSlots,availableBySource))
    .filter((topic):topic is DailyReportTopic=>topic!==null),buckets.length)
    .map((topic) => attachTopicAnalysis(topic, analysisCache,analysisReader))
    .sort((left, right) => right.dailyScore - left.dailyScore)
    .map((topic, index) => ({ ...topic, rank: index + 1 }));
}

function toDailyReportTopic(bucket: TopicBucket, totalSamples: number, sampleWeight: number,totalSlots:number,availableBySource:Map<string,Set<string>>): DailyReportTopic|null {
  const rankingEvidence=dailyRankingEvidence(bucket.rankingObservations,availableBySource,totalSlots);
  if(!rankingEvidence)return null;
  const dailyScore=rankingEvidence.score;
  const byPlatform=new Map<string,TopicOccurrence>();
  for(const item of bucket.occurrences){
    const rank=dailyPlatformRank(item),previous=byPlatform.get(item.sourceId);
    if(rank===undefined||!rankingEvidence.platforms.includes(item.sourceId))continue;
    if(rank<(previous?dailyPlatformRank(previous)!:Infinity))byPlatform.set(item.sourceId,item);
  }
  const uniqueLinks=[...byPlatform.values()].sort((a,b)=>dailyPlatformRank(a)!-dailyPlatformRank(b)!).slice(0,6);
  const firstTopic = bucket.topics[0];
  const coverOccurrence = bucket.occurrences.find((item) => item.cover);

  return {
    id: bucket.key,
    rank: 0,
    title: bucket.title,
    dailyScore,
    rankingEvidence,
    peakRank: Number.isFinite(bucket.peakRank) ? bucket.peakRank : 0,
    peakHeatScore: bucket.peakHeatScore,
    activeHours: bucket.snapshotDates.size,
    sampleCount: bucket.snapshotDates.size,
    sampleCoverage: bucket.snapshotDates.size / totalSamples,
    sources: rankingEvidence.platforms.map(id=>getSourceById(id)!.displayName),
    categories: [...bucket.categories],
    sentiment: bucket.sentiment,
    signal: inferDailySignal(bucket, sampleWeight),
    oneLine: firstTopic?.summary.oneLine ?? `${bucket.title} 是过去 24 小时的高频中文互联网话题。`,
    whyItMatters:
      firstTopic?.summary.whyItMatters ??
      "它在过去 24 小时持续出现在榜单中，适合作为日更内容的主线素材。",
    cover: coverOccurrence?.cover,
    coverSourceId: coverOccurrence?.sourceId,
    ...(coverOccurrence?{coverAttribution:{pageUrl:coverOccurrence.url,publisher:coverOccurrence.sourceName}}:{}),
    analysisSnapshotDate: bucket.peakSnapshotDate,
    analysisTopicId: bucket.peakTopicId,
    links: uniqueLinks.map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      title: item.title,
      url: item.url
    }))
  };
}

function attachTopicAnalysis(
  topic: DailyReportTopic,
  analysisCache: Map<string, ReturnType<typeof readTopicAnalysesForDate>>,
  analysisReader:typeof readTopicAnalysesForDate
): DailyReportTopic {
  if (!topic.analysisSnapshotDate || !topic.analysisTopicId) {
    return topic;
  }

  const analyses =
    analysisCache.get(topic.analysisSnapshotDate) ?? analysisReader(topic.analysisSnapshotDate);
  analysisCache.set(topic.analysisSnapshotDate, analyses);

  const aiAnalysis = analyses[topic.analysisTopicId];
  return aiAnalysis ? { ...topic, aiAnalysis } : topic;
}

async function generateDrafts(
  reportDate: string,
  snapshots: DailySnapshot[],
  topics: DailyReportTopic[],
  window: { start: string; end: string;complete?:boolean;observedUntil?:string },
  log: GenerationLog
): Promise<GeneratedDrafts> {
  const fallback = buildFallbackDrafts(reportDate, snapshots, topics);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";

  if (!apiKey || topics.length === 0) {
    log('warn', !apiKey?'未配置 DEEPSEEK_API_KEY，中文稿件使用 local-template 回退':'没有话题，中文稿件使用 local-template');
    return fallback;
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.42,
        messages: [
          {
            role: "system",
            content: buildDailySystemPrompt()
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                reportDate,
                window: {
                  ...window,
                  snapshots: snapshots.length
                },
                topics: topics.map((topic) => ({
                  rank: topic.rank,
                  title: topic.title,
                  dailyScore: topic.dailyScore,
                  sampleCount: topic.sampleCount ?? topic.activeHours,
                  sampleCoverage: topic.sampleCoverage,
                  peakRank: topic.peakRank,
                  sources: topic.sources,
                  sentiment: sentimentLabel(topic.sentiment),
                  oneLine: topic.oneLine,
                  whyItMatters: topic.whyItMatters,
                  summary:topic.aiAnalysis?.summary,
                  detailedContent:topic.aiAnalysis?.detailedContent,
                  currentReporting:topic.research?.documents.filter(doc=>doc.purpose==='event'),
                  relatedDevelopments:topic.relatedDevelopments?.map(stage=>({title:stage.title,summary:stage.aiAnalysis?.summary}))
                }))
              },
              null,
              2
            )
          }
        ]
      })
    });

    if (!response.ok) {
      log('warn', `中文稿件 AI 请求 HTTP ${response.status}，使用 local-template 回退`);
      return fallback;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      log('warn', '中文稿件 AI 返回空内容，使用 local-template 回退');
      return fallback;
    }

    const parsed = cleanGeneratedNewsValue(JSON.parse(content)) as Partial<GeneratedDrafts>;
    const draftFields = ['headline','overview','wechatDraft','videoScript'] as const;
    const missingFields = draftFields.filter(field=>typeof parsed[field]!=='string'||!parsed[field]?.trim());
    if(missingFields.length) log('warn', `中文 AI 稿件字段不完整，以下字段使用 local-template：${missingFields.join('、')}`);
    return {
      headline: textOr(parsed.headline, fallback.headline),
      overview: textOr(parsed.overview, fallback.overview),
      wechatDraft: textOr(parsed.wechatDraft, fallback.wechatDraft),
      videoScript: textOr(parsed.videoScript, fallback.videoScript),
      model: missingFields.length===draftFields.length?'local-template':missingFields.length?`${model}+local-template`:model
    };
  } catch(error) {
    log('warn', `中文稿件 AI 异常，使用 local-template 回退：${error instanceof Error?error.message:'未知错误'}`);
    return fallback;
  }
}

function buildDailySystemPrompt() {return newsroomPrompt('daily');}

function buildFallbackDrafts(
  reportDate: string,
  snapshots: DailySnapshot[],
  topics: DailyReportTopic[]
): GeneratedDrafts {
  const headline = topics[0] ? `WcCAT ${reportDate} 中文互联网日报` : `WcCAT ${reportDate} 暂无足够热点`;
  const topicLines = topics
    .map(
      (topic) =>
        `${topic.rank}. ${topic.title}：${topic.oneLine} 来源覆盖 ${topic.sources.join("、")}，采样出现 ${topic.sampleCount ?? topic.activeHours} 次。`
    )
    .join("\n");
  const overview =
    topics.length > 0
      ? `本次 02:00 至次日 02:00 的 24 小时统计窗口内，中文互联网的注意力集中在「${topics[0].title}」等话题。榜单综合了 ${snapshots.length} 次采样快照，优先考虑跨平台共振、采样覆盖和峰值排名。`
      : "过去 24 小时的快照数量不足，暂时无法生成可靠日报。";

  return {
    headline,
    overview,
    wechatDraft: `${headline}\n\n${overview}\n\nTop 10 热点：\n${topicLines}\n\nWcCAT 的观察重点不是单个平台的热搜，而是这些话题如何共同构成今天中文互联网的注意力结构：哪些是公共事件，哪些是娱乐消费，哪些代表求证，哪些代表情绪扩散。`,
    videoScript: `今天的 WcCAT，带你用 90 秒看懂过去 24 小时中文互联网在关心什么。\n\n${topicLines}\n\n总结一下，今天的核心不是单个热搜，而是这些话题背后的注意力、情绪和平台差异。这里是 WcCAT，What Chinese Care About Today。`,
    model: "local-template"
  };
}

function inferDailySignal(bucket: TopicBucket, sampleWeight: number): DailyReportTopic["signal"] {
  if (bucket.snapshotDates.size * sampleWeight >= 8 && bucket.peakRank <= 5) {
    return "dominant";
  }
  if (bucket.latestSignal === "rising" || bucket.latestSignal === "new") {
    return "rising";
  }

  return "long-tail";
}

function textOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
