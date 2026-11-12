import type { Sentiment, TopicGroup, TopicOccurrence } from "./types";
import { inferSentiment, sentimentLabel } from "./sentiment";
import type { ArticleContext } from "./fulltext";

export type BattleStance = {
  redLabel: string;
  blueLabel: string;
  redScore: number;
  blueScore: number;
  redRationale: string;
  blueRationale: string;
};

export type PlatformAnalysis = {
  sourceId: string;
  sourceName: string;
  attitude: string;
  stance: "red" | "blue" | "neutral";
  confidence: number;
  evidence: string;
};

export type TopicAnalysis = {
  summary: string;
  detailedContent: string;
  outsiderContext: string;
  battle: BattleStance;
  platformAnalyses: PlatformAnalysis[];
  model: string;
  changeReason?: string;
};

export type TopicAnalysisTrace = {
  provider: "deepseek" | "local";
  model: string;
  status: string;
  durationMs: number;
  usedFallback: boolean;
  error?: string;
  request: unknown;
  response: unknown;
};

const platformLens: Record<string, string> = {
  weibo: "微博更像公共情绪广场，重点观察情绪强度、争议扩散和娱乐化表达。",
  baidu: "百度更像搜索意图窗口，重点观察大众是否在主动求证、追问原因或查找背景。",
  zhihu: "知乎更像解释与辩论社区，重点观察原因分析、责任归因和价值判断。",
  bilibili: "B 站更像视频文化场，重点观察二创、UP 主叙事、弹幕和年轻用户的参与方式。",
  thepaper: "澎湃更像媒体叙事入口，重点观察事实梳理、公共议题和事件背景。",
  toutiao: "今日头条更像大众资讯流，重点观察新闻分发、地域性关注和即时性。"
};

export function buildFallbackTopicAnalysis(topic: TopicGroup): TopicAnalysis {
  const sentiments = topic.occurrences.map((item) => inferSentiment(`${item.title} ${item.description ?? ""}`));
  const redScore = clamp(
    35 +
      scoreSentiments(sentiments, ["anger", "dislike", "anxiety", "debate"]) +
      (topic.officialPublicResonance ? 8 : 0)
  );
  const blueScore = clamp(100 - redScore + scoreSentiments(sentiments, ["curiosity", "like", "love"], 0.6));
  const normalizedRed = normalizePair(redScore, blueScore).red;
  const normalizedBlue = normalizePair(redScore, blueScore).blue;
  const platformAnalyses = uniqueOccurrencesBySource(topic.occurrences)
    .slice(0, 8)
    .map((item) => buildPlatformAnalysis(item, normalizedRed, normalizedBlue));

  return {
    summary: topic.summary.oneLine,
    detailedContent: `${topic.summary.whyItMatters} ${topic.summary.context}`,
    outsiderContext:
      "对不了解中文互联网的读者来说，这个话题需要结合平台来源理解：搜索热度代表求证需求，社交热度代表情绪扩散，媒体热度代表公共叙事进入。",
    battle: {
      redLabel: inferRedLabel(topic),
      blueLabel: inferBlueLabel(topic),
      redScore: normalizedRed,
      blueScore: normalizedBlue,
      redRationale: "红色侧代表更强的质疑、担忧、争议或负面情绪，来自标题词、平台性质和跨平台扩散强度。",
      blueRationale: "蓝色侧代表更强的解释、围观、支持或求证需求，来自搜索行为、媒体梳理和非对抗性讨论。"
    },
    platformAnalyses,
    model: "local-rules"
  };
}

export async function analyzeTopicWithDeepSeek(
  topic: TopicGroup,
  articleContexts: ArticleContext[] = [],
  previousAnalysis?: TopicAnalysis,
  onTrace?: (trace: TopicAnalysisTrace) => void
): Promise<TopicAnalysis> {
  const startedAt = Date.now();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const fallback = buildFallbackTopicAnalysis(topic);
  const stableFallback = previousAnalysis
    ? stabilizeAnalysis(fallback, previousAnalysis, fallback.model, "AI 不可用时沿用历史分析锚点。")
    : fallback;
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  const requestBody = {
    model,
    response_format: { type: "json_object" },
    max_tokens: 8192,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "system",
        content: buildAnalysisSystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify(toPromptPayload(topic, articleContexts, previousAnalysis), null, 2)
      }
    ],
    temperature: 0.35
  };

  if (!apiKey) {
    onTrace?.({
      provider: "local",
      model: "local-rules",
      status: "missing-api-key",
      durationMs: Date.now() - startedAt,
      usedFallback: true,
      error: "DEEPSEEK_API_KEY is not configured",
      request: requestBody,
      response: stableFallback
    });
    return stableFallback;
  }

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request = attempt === 1 ? requestBody : {
      ...requestBody,
      messages: [...requestBody.messages, {
        role: "user",
        content: "上一次响应为空、被截断或无法解析为完整分析。请重新依据上述材料输出符合示例结构的完整 JSON 对象，正确转义字符串里的双引号，不要输出 Markdown 或额外解释。"
      }]
    };
    let responseDetails: unknown;
    let failureStatus = "exception";
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        onTrace?.({
          provider: "deepseek", model, status: `http-${response.status}`,
          durationMs: Date.now() - startedAt, usedFallback: true,
          error: errorText.slice(0, 2000), request, response: errorText
        });
        return stableFallback;
      }

      const responseText = await response.text();
      responseDetails = { rawResponse: responseText };
      failureStatus = "invalid-json";
      const payload = JSON.parse(responseText) as {
        id?: string;
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
        usage?: unknown;
      };
      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      // Preserve the actual failed output for diagnosis without storing unnecessary reasoning text.
      responseDetails = { id: payload.id, finishReason: choice?.finish_reason, content, usage: payload.usage };
      if (choice?.finish_reason === "length") {
        failureStatus = "truncated-content";
        throw new Error("DeepSeek output reached the token limit");
      }
      if (typeof content !== "string" || !content.trim()) {
        failureStatus = "empty-content";
        throw new Error("DeepSeek returned blank content");
      }
      const parsed: unknown = JSON.parse(content);
      failureStatus = "invalid-analysis";
      if (!hasCompleteAnalysis(parsed, topic)) {
        throw new Error("DeepSeek returned incomplete analysis fields");
      }
      failureStatus = "exception";
      const analysis = normalizeAnalysis(parsed, fallback, model, previousAnalysis);
      onTrace?.({
        provider: "deepseek", model, status: "ok", durationMs: Date.now() - startedAt,
        usedFallback: false, request, response: responseDetails
      });
      return analysis;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const retry = failureStatus !== "exception" && attempt < maxAttempts;
      onTrace?.({
        provider: "deepseek", model,
        status: `${failureStatus}${retry ? "-retrying" : ""}`,
        durationMs: Date.now() - startedAt, usedFallback: !retry,
        error: `${message} (attempt ${attempt}/${maxAttempts})`, request,
        response: responseDetails ?? { error: message }
      });
      if (!retry) return stableFallback;
    }
  }
  return stableFallback;
}

function hasCompleteAnalysis(value: unknown, topic: TopicGroup) {
  const hasText = (record: Record<string, unknown>, fields: string[]) =>
    fields.every((field) => Boolean(toStringValue(record[field])));
  const isScore = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  if (!isRecord(value) || !hasText(value, ["summary", "detailedContent", "outsiderContext"]) ||
      !isRecord(value.battle) || !Array.isArray(value.platformAnalyses)) return false;
  const battle = value.battle;
  if (!hasText(battle, ["redLabel", "blueLabel", "redRationale", "blueRationale"]) ||
      !isScore(battle.redScore) || !isScore(battle.blueScore)) return false;
  if (!value.platformAnalyses.every((item) => isRecord(item) &&
      hasText(item, ["sourceId", "sourceName", "attitude", "evidence"]) &&
      ["red", "blue", "neutral"].includes(String(item.stance)) && isScore(item.confidence))) return false;
  const analyzedSources = new Set(value.platformAnalyses.map((item) => item.sourceId));
  return topic.occurrences.slice(0, 10).every((item) => analyzedSources.has(item.sourceId));
}

function buildAnalysisSystemPrompt() {
  return `你是 WcCAT 的中文互联网观察分析器。你的任务不是翻译热搜，而是解释一个话题在不同中文平台中的情绪、利益冲突、关注动机和叙事差异。

请严格输出 JSON，不要输出 Markdown。字段如下：
{
  "summary": "80字以内的话题摘要",
  "detailedContent": "180字以内的详细内容，说明事件/话题本身发生了什么",
  "outsiderContext": "120字以内，给不了解中文互联网的外国读者解释为什么这件事值得看",
  "battle": {
    "redLabel": "红色能量条代表的实际简略观点，不要写正方/反方",
    "blueLabel": "蓝色能量条代表的实际简略观点，不要写正方/反方",
    "redScore": 0-100,
    "blueScore": 0-100,
    "redRationale": "红色观点为什么有能量",
    "blueRationale": "蓝色观点为什么有能量"
  },
  "platformAnalyses": [
    {
      "sourceId": "平台ID",
      "sourceName": "平台名",
      "attitude": "该平台对此话题的态度/讨论方式，不能只写平台通用描述",
      "stance": "red|blue|neutral",
      "confidence": 0-100,
      "evidence": "从标题、描述、排名或平台语境提取的依据"
    }
  ],
  "changeReason": "如果存在 previousAnalysis，说明本次相较上一版的变化原因；如果没有则写首次分析"
}

规则：
- 红蓝不是道德正反方，必须使用从话题中提炼出的真实简略观点。
- 不要编造未提供的事实；优先基于关联正文，其次基于输入标题、描述、来源、排名和平台属性推断。
- 如果信息不足，明确说“从现有榜单信号看”。
- 平台态度要比较差异：微博/百度/B站/澎湃/头条等不能全部说一样。
- 如果输入中存在 previousAnalysis，必须把它作为稳定锚点：
  - 除非出现官方通报、事实反转、新增关键来源或事件性质明显升级，否则 redLabel 和 blueLabel 必须沿用上一版。
  - 不允许把红蓝两侧观点左右互换。
  - redScore/blueScore 默认最多相较上一版变化 10 分。
  - 如果你认为必须变化超过 10 分，changeReason 必须说明触发变化的具体新事实，但程序仍可能限制分数漂移。
  - 不要把具体争议改写成泛泛价值判断。`;
}

function toPromptPayload(topic: TopicGroup, articleContexts: ArticleContext[], previousAnalysis?: TopicAnalysis) {
  return {
    topic: {
      title: topic.title,
      heatScore: topic.heatScore,
      sentiment: sentimentLabel(topic.sentiment),
      officialPublicResonance: topic.officialPublicResonance,
      summary: topic.summary
    },
    sources: topic.occurrences.slice(0, 10).map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      rank: item.rank,
      title: item.title,
      description: item.description,
      heatText: item.heatText,
      heatValue: item.heatValue,
      platformLens: platformLens[item.sourceId] ?? "通用中文互联网平台"
    })),
    articleContexts: articleContexts.map((context) => ({
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      title: context.title,
      url: context.url,
      text: context.text
    })),
    previousAnalysis: previousAnalysis
      ? {
          summary: previousAnalysis.summary,
          battle: previousAnalysis.battle,
          platformAnalyses: previousAnalysis.platformAnalyses,
          model: previousAnalysis.model,
          changeReason: previousAnalysis.changeReason
        }
      : null
  };
}

function normalizeAnalysis(
  value: unknown,
  fallback: TopicAnalysis,
  model: string,
  previousAnalysis?: TopicAnalysis
): TopicAnalysis {
  if (!isRecord(value)) {
    return fallback;
  }

  const battle = isRecord(value.battle) ? value.battle : {};
  const redScore = clamp(toNumber(battle.redScore) ?? fallback.battle.redScore);
  const blueScore = clamp(toNumber(battle.blueScore) ?? fallback.battle.blueScore);
  const pair = stabilizePair(normalizePair(redScore, blueScore), previousAnalysis);
  const platformAnalyses = Array.isArray(value.platformAnalyses)
    ? value.platformAnalyses.filter(isRecord).map((item, index) => ({
        sourceId: toStringValue(item.sourceId) || fallback.platformAnalyses[index]?.sourceId || "unknown",
        sourceName: toStringValue(item.sourceName) || fallback.platformAnalyses[index]?.sourceName || "未知平台",
        attitude: toStringValue(item.attitude) || fallback.platformAnalyses[index]?.attitude || "暂无明确态度。",
        stance: normalizeStance(item.stance),
        confidence: clamp(toNumber(item.confidence) ?? 55),
        evidence: toStringValue(item.evidence) || fallback.platformAnalyses[index]?.evidence || "基于榜单信号推断。"
      }))
    : fallback.platformAnalyses;

  return {
    summary: toStringValue(value.summary) || fallback.summary,
    detailedContent: toStringValue(value.detailedContent) || fallback.detailedContent,
    outsiderContext: toStringValue(value.outsiderContext) || fallback.outsiderContext,
    battle: {
      redLabel: previousAnalysis?.battle.redLabel || toStringValue(battle.redLabel) || fallback.battle.redLabel,
      blueLabel: previousAnalysis?.battle.blueLabel || toStringValue(battle.blueLabel) || fallback.battle.blueLabel,
      redScore: pair.red,
      blueScore: pair.blue,
      redRationale: toStringValue(battle.redRationale) || fallback.battle.redRationale,
      blueRationale: toStringValue(battle.blueRationale) || fallback.battle.blueRationale
    },
    platformAnalyses: uniquePlatformAnalyses(platformAnalyses),
    model,
    changeReason: toStringValue(value.changeReason) || (previousAnalysis ? "沿用历史分析锚点，未发现足以改变对抗结构的新信息。" : "首次分析")
  };
}

function stabilizeAnalysis(
  analysis: TopicAnalysis,
  previousAnalysis: TopicAnalysis,
  model: string,
  changeReason: string
): TopicAnalysis {
  const pair = stabilizePair(
    normalizePair(analysis.battle.redScore, analysis.battle.blueScore),
    previousAnalysis
  );

  return {
    ...analysis,
    battle: {
      ...analysis.battle,
      redLabel: previousAnalysis.battle.redLabel,
      blueLabel: previousAnalysis.battle.blueLabel,
      redScore: pair.red,
      blueScore: pair.blue
    },
    model,
    changeReason
  };
}

function uniqueOccurrencesBySource(occurrences: TopicOccurrence[]) {
  const seen = new Set<string>();
  return occurrences.filter((item) => {
    if (seen.has(item.sourceId)) {
      return false;
    }
    seen.add(item.sourceId);
    return true;
  });
}

function uniquePlatformAnalyses(items: PlatformAnalysis[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.sourceId || item.sourceName;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildPlatformAnalysis(item: TopicOccurrence, redScore: number, blueScore: number): PlatformAnalysis {
  const sentiment = inferSentiment(`${item.title} ${item.description ?? ""}`);
  const stance = redLeaning(sentiment) ? "red" : blueLeaning(sentiment) ? "blue" : "neutral";

  return {
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    attitude: `${platformLens[item.sourceId] ?? "该平台提供了另一组观察视角"} 从现有榜单信号看，它更接近「${sentimentLabel(sentiment)}」语气。`,
    stance,
    confidence: stance === "red" ? redScore : stance === "blue" ? blueScore : 52,
    evidence: `标题「${item.title}」位于 ${item.sourceName} #${item.rank}。`
  };
}

function inferRedLabel(topic: TopicGroup) {
  if (topic.sentiment === "anger" || topic.sentiment === "dislike") {
    return "质疑与不满正在升温";
  }
  if (topic.sentiment === "anxiety") {
    return "风险与担忧被放大";
  }
  if (topic.sentiment === "debate") {
    return "争议方要求解释";
  }
  return "警惕与质疑侧";
}

function inferBlueLabel(topic: TopicGroup) {
  if (topic.sentiment === "curiosity") {
    return "求证与围观需求";
  }
  if (topic.sentiment === "love" || topic.sentiment === "like") {
    return "支持与喜爱侧";
  }
  if (topic.sentiment === "entertainment") {
    return "娱乐化传播侧";
  }
  return "解释与观察侧";
}

function scoreSentiments(sentiments: Sentiment[], targets: Sentiment[], multiplier = 1) {
  return sentiments.filter((sentiment) => targets.includes(sentiment)).length * 8 * multiplier;
}

function redLeaning(sentiment: Sentiment) {
  return ["anger", "dislike", "anxiety", "debate"].includes(sentiment);
}

function blueLeaning(sentiment: Sentiment) {
  return ["curiosity", "love", "like", "entertainment"].includes(sentiment);
}

function normalizePair(red: number, blue: number) {
  const safeRed = clamp(red);
  const safeBlue = clamp(blue);
  const total = safeRed + safeBlue || 100;
  return {
    red: Math.round((safeRed / total) * 100),
    blue: Math.round((safeBlue / total) * 100)
  };
}

function stabilizePair(pair: { red: number; blue: number }, previousAnalysis?: TopicAnalysis) {
  if (!previousAnalysis) {
    return pair;
  }

  const previousPair = normalizePair(previousAnalysis.battle.redScore, previousAnalysis.battle.blueScore);
  const maxDelta = parseStableScoreDelta();
  const red = Math.max(previousPair.red - maxDelta, Math.min(previousPair.red + maxDelta, pair.red));

  return {
    red,
    blue: 100 - red
  };
}

function parseStableScoreDelta() {
  const parsed = Number(process.env.WCCAT_AI_STABLE_SCORE_DELTA ?? 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
}

function clamp(value: number) {
  return Math.max(5, Math.min(95, Math.round(value)));
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStance(value: unknown): PlatformAnalysis["stance"] {
  return value === "red" || value === "blue" || value === "neutral" ? value : "neutral";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
