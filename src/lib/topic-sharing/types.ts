import type {TopicAnalysis} from '../topic-analysis';
import type {CommentExamples,CommentQuote} from '../comments/types';
import type {TopicResearch} from './research/types';

export type TopicShareRef =
 | {kind:'hourly';snapshot:string;version:string;key:string}
 | {kind:'daily';date:string;topicId:string;version?:string};
export type EditorialColumn='inside'|'voices'|'tech';
export type TopicShareLanguage='en'|'zh';
export type TopicShareLink={sourceId:string;sourceName:string;title:string;url:string};
export type TopicPhoto={id:string;sourceUrl:string;pageUrl:string;publisher:string;width:number;height:number;dataBase64:string};
export type TopicReaderComment=CommentQuote&{side?:'red'|'blue'};
export type TopicShareSource={
 ref:TopicShareRef;sourceKey:string;fingerprint:string;date:string;observedAt:string;
 topicId:string;title:string;summary:string;detail:string;context:string;
 categories:string[];rank:number;signal:string;links:TopicShareLink[];
 analysis?:TopicAnalysis;commentExamples?:CommentExamples;cover?:string;
 coverAttribution?:{pageUrl:string;publisher:string};
 research?:TopicResearch;
 photo?:TopicPhoto;readerComments?:TopicReaderComment[];assetWarnings?:string[];
 /** Identity of the saved source before generation-time comment enrichment. Server-owned. */
 baseFingerprint?:string;
};
export type TopicRecommendation={
 column:EditorialColumn;
 english:{score:number;reason:string;angle:string};
 chinese:{score:number;reason:string;angle:string};
 evidenceLevel:'comments'|'analysis'|'headline';warnings:string[];
};
export type TopicSharePost={id:string;pattern:string;text:string;reason:string};
export type LocalizedTopicShare={
 headline:string;hook:string;summary:string;context:string;whyItMatters:string;
 question:string;posts:TopicSharePost[];selectedPostId:string;replies:string[];altText:string;
 article?:{title:string;body:string};
 attitudes?:{redLabel:string;blueLabel:string};
};
export type TopicShareCopy={
 version:1;generatedAt:string;model:string;sourceFingerprint:string;column:EditorialColumn;
 en:LocalizedTopicShare;zh:LocalizedTopicShare;
 editorialPolicy?:'news-commentary-v1'|'news-commentary-v2';
};
export type TopicShareReviewWarning={path:string;code:string;message:string;values?:string[]};
export type TopicShareRecord={id:string;revision:string;source:TopicShareSource;copy:TopicShareCopy;reviewWarnings?:TopicShareReviewWarning[]};
export type TopicShareCandidate={
 id:string;ref:TopicShareRef;title:string;date:string;rank:number;recommendation:TopicRecommendation;
};
