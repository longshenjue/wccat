import type {ShareEnImageAsset} from './shareen-image-types';
import type {EditorialColumn} from './topic-sharing/types';

export type ShareEnBattle={redLabel:string;blueLabel:string;redRationale:string;blueRationale:string;redScore:number;blueScore:number;basis:'analysis'|'estimate'};
export type ShareEnHighlight={topicId:string;hook:string;whatHappened:string;context:string;whyItMatters:string;column?:EditorialColumn;imageUrl?:string;hideImage?:boolean;imageAsset?:ShareEnImageAsset;battle?:ShareEnBattle};
export type ShareEnCopy={
 version:1;generatedAt:string;model:string;sourceFingerprint:string;
 /** Opt-in presentation and caption contract; absent on saved legacy editions. */
 layout?:'editorial';
 /** Absent on legacy caches whose numbered captions describe the original top three. */
 captionBasis?:'highlights';
 overview:{headline:string;summary:string;topics:Array<{id:string;title:string}>};
 highlights:ShareEnHighlight[];top3:Array<{topicId:string;summary:string}>;
 posts:Array<{id:string;template:string;text:string;reason:string}>;selectedPostId:string;altTexts:string[];
};
export type SharingFormat='all'|'english'|'shareen'|'images';
