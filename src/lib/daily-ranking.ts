import {platformPolicy,platformRank} from './platform-ranking';
import type {PlatformTier,TopicOccurrence} from './types';

// Retain the shape of unshipped/local v2 reports that may already have been saved.
type LegacyDailyRankingEvidence={policy:'cross-platform-v2';basis:'cross-platform'|'single-platform-hotlist';platforms:string[];coveredSlots:number;totalSlots:number;spreadScore:number;coverageScore:number;prominenceScore:number};
export type DailyPlatformContribution={sourceId:string;tier:PlatformTier;cap:number;peakStrength:number;meanStrength:number;coveredSlots:number;availableSlots:number;score:number};
export type TierDailyRankingEvidence={policy:'platform-tier-v3';basis:'cross-platform'|'single-platform';platforms:string[];coveredSlots:number;totalSlots:number;contributions:DailyPlatformContribution[];score:number};
export type DailyRankingEvidence=LegacyDailyRankingEvidence|TierDailyRankingEvidence;
export type DailyRankingObservation={snapshotDate:string;occurrence:TopicOccurrence};
export const dailyPlatformRank=platformRank;

/** Manual refreshes within a scheduled block cannot multiply persistence. */
export function dailyCoverageSlot(snapshotDate:string):string {
 return `${snapshotDate.slice(0,10)}-${Math.floor(Number(snapshotDate.slice(11,13))/4)*4}`;
}

/** Each source's entire day fits inside its tier cap; unavailable source captures are not zeroes. */
export function dailyRankingEvidence(observations:DailyRankingObservation[],availableBySource:Map<string,Set<string>>,totalSlots:number):TierDailyRankingEvidence|undefined {
 const bySource=new Map<string,Map<string,number>>(),coveredSlots=new Set<string>();
 for(const {snapshotDate,occurrence} of observations){
  const evidence=occurrence.platformScoring;
  if(dailyPlatformRank(occurrence)===undefined||!evidence||evidence.policy!=='platform-tier-v3'||!Number.isFinite(evidence.strength))continue;
  const slots=bySource.get(occurrence.sourceId)??new Map<string,number>(),slot=dailyCoverageSlot(snapshotDate);
  slots.set(slot,Math.max(slots.get(slot)??0,Math.max(0,Math.min(1,evidence.strength))));
  bySource.set(occurrence.sourceId,slots);coveredSlots.add(slot);
 }
 if(!bySource.size)return;
 const platforms=[...bySource.keys()].sort();
 const contributions=platforms.map(sourceId=>{
  const slots=bySource.get(sourceId)!,policy=platformPolicy(sourceId)!;
  const availableSlots=Math.max(slots.size,availableBySource.get(sourceId)?.size??0,1);
  const values=[...slots.values()],peakStrength=Math.max(...values),meanStrength=values.reduce((a,b)=>a+b,0)/availableSlots;
  return {sourceId,tier:policy.tier,cap:policy.cap,peakStrength,meanStrength,coveredSlots:slots.size,availableSlots,
   score:policy.cap*(.7*peakStrength+.3*meanStrength)};
 });
 return {policy:'platform-tier-v3',basis:platforms.length>1?'cross-platform':'single-platform',platforms,coveredSlots:coveredSlots.size,totalSlots,
  contributions,score:Math.round(contributions.reduce((sum,item)=>sum+item.score,0))};
}

/** Platform diversity emerges from bounded contributions, not exclusions or fixed quotas. */
export function selectDailyCandidates<T extends {dailyScore:number}>(candidates:T[],limit=10):T[] {
 return [...candidates].sort((a,b)=>b.dailyScore-a.dailyScore).slice(0,limit);
}
