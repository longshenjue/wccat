export type ResearchQuery={query:string;purpose:'event'|'background';language?:'zh'|'en';date?:string;provider?:'encyclopedia'};
export type ResearchPlan={questions:string[];queries:ResearchQuery[];anchors?:string[]};
export type ResearchHit={title:string;url:string;snippet:string;publishedAt?:string};
export type ResearchDocument={id:string;url:string;title:string;publisher:string;text:string;retrievedAt:string;publishedAt?:string;purpose:'event'|'background'};
export type ResearchImage={url:string;pageUrl:string;publisher:string};
export type TopicResearch={policy:'news-research-v1';checkedAt:string;status:'ready'|'partial'|'unavailable';questions:string[];queries:ResearchQuery[];documents:ResearchDocument[];warnings:string[];imageCandidates?:ResearchImage[];threadCandidates?:Array<{sourceId:string;sourceName:string;title:string;url:string}>};
export type ResearchRead={url:string;text:string;contentType:string};
