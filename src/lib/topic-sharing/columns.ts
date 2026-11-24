import type {EditorialColumn,TopicShareLanguage} from './types';

export const EDITORIAL_COLUMNS:ReadonlyArray<{id:EditorialColumn;en:string;zh:string;description:string}>=[
 {id:'inside',en:"Inside China's Internet",zh:'中文互联网观察',description:'Explain a specific attention story and the cultural context needed to read it.'},
 {id:'voices',en:'In Their Words',zh:'他们怎么说',description:'Read saved, attributed comments as individual voices, without claiming a representative split.'},
 {id:'tech',en:'China Tech, in Context',zh:'中国科技，放回语境',description:'Explain a technology, car or consumer development, its practical stakes and what remains unverified.'}
];

export function columnForLanguage(id:EditorialColumn,language:TopicShareLanguage):string {
 const column=EDITORIAL_COLUMNS.find(item=>item.id===id);
 if(!column)throw new Error('Unknown editorial column');
 return column[language];
}
