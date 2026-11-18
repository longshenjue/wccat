export type EvidenceCapability = 'hotlist' | 'search' | 'detail' | 'comments' | 'analysis';
export type EvidenceStatus = 'running' | 'success' | 'empty' | 'partial' | 'failed';
export interface EvidenceSource {
  provider: string;
  platform: string;
  adapter: string;
  capability: EvidenceCapability;
  termsUrl?: string;
  rightsStatus?: 'unknown' | 'allowed' | 'restricted';
  rightsNote?: string;
}
export interface EvidenceMetric {
  value: number | null;
  rawValue?: string;
  unit?: string;
  scope?: string;
  path?: string;
  aliasOf?: string;
  status?: 'observed' | 'missing' | 'unsupported' | 'invalid';
}
export interface EvidenceItem {
  url: string;
  platformId?: string;
  kind?: string;
  title?: string;
  description?: string;
  text?: string;
  publishedAt?: string;
  sourceUpdatedAt?: string;
  parentDocumentId?: string;
  authorKey?: string;
  rank?: number;
  heatValue?: number;
  heatText?: string;
  heatUnit?: string;
  metrics?: Record<string, number | null | EvidenceMetric>;
  payload?: unknown;
}
export interface EvidenceBatch {
  id?: string;
  source: EvidenceSource;
  status: EvidenceStatus;
  startedAt?: string;
  finishedAt?: string;
  observedAt?: string;
  request?: unknown;
  response?: unknown;
  responseTruncated?: boolean;
  responseSourceBytes?: number | null;
  responseCapturedBytes?: number | null;
  httpStatus?: number;
  error?: string;
  sourceUpdatedAt?: string;
  cached?: boolean;
  provenance?: string;
  legacySnapshotDate?: string;
  items: EvidenceItem[];
  cost?: number;
  currency?: string;
}
export interface SearchEvidence {
  id?: string;
  source: EvidenceSource;
  query: string;
  actualQuery?: string;
  purpose?: string;
  language?: string;
  region?: string;
  filters?: Record<string, unknown>;
  page?: number;
  cursor?: string;
  complete?: boolean;
  observedAt?: string;
  status?: EvidenceStatus;
  response?: unknown;
  hits: Array<{url:string;title?:string;snippet?:string;position:number;globalPosition?:number;type?:string;claimedPublishedAt?:string;payload?:unknown}>;
}
export interface BatchResult {runId:string;documentIds:string[];observationIds:string[]}
