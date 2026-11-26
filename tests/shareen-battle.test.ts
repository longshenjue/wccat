import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {normaliseShareEnBattle,getShareEnBattle} from '../src/lib/shareen-battle';
import {validateShareEn} from '../src/lib/shareen';
import type {ShareEnCopy} from '../src/lib/shareen-types';

const english={redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want answers about accountability.',blueRationale:'Others want verified facts before judging.',redScore:90,blueScore:10};
test('compact battle strips preserve the matching source scores and do not reuse TOP1 for other topics',async()=>{
 const report=fixture('2026-11-15');report.topics=[...report.topics,{...report.topics[0],id:'second',rank:2,aiAnalysis:undefined}];
 const copy:ShareEnCopy=await savedShareEnFixture(report);
 const battle=normaliseShareEnBattle(english,report,report.topics[0].id)!;
 assert.equal(battle.redScore,40);assert.equal(battle.blueScore,60);assert.equal(battle.basis,'analysis');
 assert.equal(normaliseShareEnBattle(english,report,'second')?.basis,'estimate');
 assert.equal(normaliseShareEnBattle(english,report,'second')?.redScore,90);
 assert.equal(normaliseShareEnBattle(english,report,'not-a-topic'),undefined);
 assert.equal(getShareEnBattle(report,copy,1)?.redLabel,'Doubt');
 report.shareEnglish!.topics[0].id='second';
 assert.equal(getShareEnBattle(report,copy,1),undefined,'stale English TOP1 must not supply another topic’s attitudes');
 report.shareEnglish!.topics[0].id=report.topics[0].id;
 assert.equal(getShareEnBattle(report,copy,2),undefined);
 copy.highlights[0].battle=battle;copy.highlights[0].hideImage=true;
 const saved=validateShareEn(copy,report);assert.deepEqual(saved.highlights[0].battle,battle);assert.equal(saved.highlights[0].hideImage,true);
 copy.highlights[0].battle={} as NonNullable<ShareEnCopy['highlights'][number]['battle']>;
 assert.equal(validateShareEn(copy,report).highlights[0].battle,undefined,'malformed optional stance must not block an otherwise valid article');
 delete copy.highlights[0].battle;assert.ok(validateShareEn(copy,report),'legacy cache remains valid without a battle');
});
test('English attitude text stays complete and invalid estimates do not become a fake balance',()=>{
 const report=fixture('2026-11-15');report.topics[0].aiAnalysis=undefined;
 const long=normaliseShareEnBattle({...english,redLabel:'A very long opinion label with too many words',redRationale:'A long explanation which continues for many words and must stay compact on the card.'},report,report.topics[0].id)!;
 assert.equal(long.redLabel,'A very long opinion label with too many words');
 assert.equal(long.redRationale,'A long explanation which continues for many words and must stay compact on the card.');
 for(const values of [{redScore:0,blueScore:0},{redScore:NaN,blueScore:30},{redScore:-10,blueScore:110}])assert.equal(normaliseShareEnBattle({...english,...values},report,report.topics[0].id),undefined);
 assert.equal(normaliseShareEnBattle({...english,redLabel:'中文'},report,report.topics[0].id),undefined);
});
