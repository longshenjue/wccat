export type CommentSide = 'red' | 'blue';
export type SampledComment = {
  id:string; text:string; sourceId:string; sourceName:string; articleUrl:string; url:string;
  likes?:number; rank:number; observedAt:string;
};
export type CommentQuote = SampledComment & {englishText?:string;englishIsExcerpt?:boolean};
export type CommentExamples = {
  redLabel:string; blueLabel:string; red?:CommentQuote; blue?:CommentQuote;
  sampleCount:number; sampledAt:string; runIds:string[];
};
export type CommentSample = {comments:SampledComment[];runIds:string[]};
export type CommentThread = {
  key:string;sourceId:'bilibili'|'zhihu'|'weibo';sourceName:string;articleUrl:string;apiUrl?:string;bvid?:string;
};
