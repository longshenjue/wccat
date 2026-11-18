import type {EvidenceItem} from './evidence-types';
import type {RawHotItem} from './types';

/** Historical normalized fields only; does not pretend to recover the lost upstream body. */
export function legacyEvidenceItem(item:RawHotItem):EvidenceItem {
  return {url:item.url,title:item.title,description:item.description,rank:item.rank,heatValue:item.heatValue,heatText:item.heatText,
    kind:item.sourceId==='bilibili'?'video':'article',metrics:item.stats?{...item.stats}:undefined,payload:item};
}
