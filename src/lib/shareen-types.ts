export type ShareEnHighlight={topicId:string;hook:string;whatHappened:string;context:string;whyItMatters:string};
export type ShareEnCopy={
 version:1;generatedAt:string;model:string;sourceFingerprint:string;
 overview:{headline:string;summary:string;topics:Array<{id:string;title:string}>};
 highlights:ShareEnHighlight[];top3:Array<{topicId:string;summary:string}>;
 posts:Array<{id:string;template:string;text:string;reason:string}>;selectedPostId:string;altTexts:string[];
};
export type SharingFormat='all'|'english'|'shareen';
