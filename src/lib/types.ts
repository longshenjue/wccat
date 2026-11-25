export type SourceKind = "public" | "official" | "third-party";

export type SourceCategory =
  | "social"
  | "search"
  | "video"
  | "news"
  | "business"
  | "community";

export type Sentiment =
  | "love"
  | "like"
  | "anger"
  | "dislike"
  | "curiosity"
  | "anxiety"
  | "debate"
  | "entertainment"
  | "neutral";

export type AttentionSignal = "rising" | "steady" | "cooling" | "new";

export interface SourceConfig {
  id: string;
  name: string;
  displayName: string;
  category: SourceCategory;
  kind: SourceKind;
  /** Legacy metadata; platform-tier-v3 uses explicit tier caps instead. */
  weight: number;
  primaryUrl: string;
  thirdPartyUrl?: string;
  notes: string;
}

export interface RawHotItem {
  contentType?: 'article' | 'topic';
  provider?: string;
  providerEndpoint?: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceCategory: SourceCategory;
  rank: number;
  title: string;
  url: string;
  mobileUrl?: string;
  description?: string;
  cover?: string;
  heatText?: string;
  heatValue?: number;
  stats?: EngagementStats;
  fetchedAt: string;
}

export interface EngagementStats {
  views?: number;
  reads?: number;
  plays?: number;
  comments?: number;
  replies?: number;
  likes?: number;
  dislikes?: number;
  upvotes?: number;
  downvotes?: number;
  favorites?: number;
  shares?: number;
  danmaku?: number;
}

export interface TopicOccurrence extends RawHotItem {
  normalizedTitle: string;
  platformScore: number;
  platformScoring?: PlatformScoreEvidence;
}

export type PlatformTier='S'|'A'|'B'|'C'|'D';
export type PlatformScoreEvidence={
  policy:'platform-tier-v3';tier:PlatformTier;cap:number;strength:number;
  rankStrength:number;heatStrength?:number;engagementStrength?:number;
};

export interface TopicGroup {
  supplementalEvidence?: SupplementalEvidence[];
  id: string;
  title: string;
  normalizedTitle: string;
  rank: number;
  heatScore: number;
  sources: string[];
  sourceKinds: SourceKind[];
  categories: SourceCategory[];
  occurrences: TopicOccurrence[];
  signal: AttentionSignal;
  sentiment: Sentiment;
  officialPublicResonance: boolean;
  summary: TopicSummary;
}

export interface SupplementalEvidence {
  provider:string;platform:string;endpoint:string;title:string;description?:string;url:string;
  rank:number;heatText?:string;observedAt:string;runId:string;
}

export interface TopicSummary {
  oneLine: string;
  whyItMatters: string;
  context: string;
  emotion: string;
}

export interface DailyDigest {
  date: string;
  generatedAt: string;
  headline: string;
  overview: string;
  dominantSentiments: Sentiment[];
  officialFocus: string[];
  publicFocus: string[];
  resonanceTopics: string[];
}

export interface DailySnapshot {
  date: string;
  generatedAt: string;
  sources: SourceConfig[];
  rawItems: RawHotItem[];
  topics: TopicGroup[];
  digest: DailyDigest;
  evidenceRunIds?: string[];
}
