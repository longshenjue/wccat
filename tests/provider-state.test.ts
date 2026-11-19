import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProviderState,validateProviderSchema} from '../src/lib/provider-state';
import {readGeneration,acquireMaintenance,advanceGeneration,releaseMaintenance} from '../src/lib/maintenance';

const start=Date.parse('2026-11-19T03:00:00Z');
test('provider cache and conservative daily request accounting survive another connection and midnight',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-provider-'));const file=join(dir,'state.sqlite');
 const a=new Database(file),b=new Database(file);const one=new ProviderState(a),two=new ProviderState(b);
 try{
  assert.equal(one.acquire('account','weibohot',start,1,'owner-a').kind,'reserved');
  assert.equal(two.acquire('account','weibohot',start,1,'owner-b').kind,'wait');
  assert.equal(one.complete('account','weibohot','owner-a',start,{code:200,result:{list:[]}},start+1800000),true);
  const cached=two.acquire('account','weibohot',start+1000,1,'owner-b');assert.equal(cached.kind,'cached');
  if(cached.kind==='cached')assert.equal(cached.observedAt,start);
  assert.equal(two.acquire('account','weibohot',start+1800001,1,'owner-b').kind,'blocked');
  assert.equal(two.acquire('account','weibohot',Date.parse('2026-11-19T16:00:00Z'),1,'owner-c').kind,'reserved');
  assert.deepEqual(one.status('account').usage.map(row=>({day:row.day,attempts:row.attempts})),[{day:'2026-11-19',attempts:1},{day:'2026-11-20',attempts:1}]);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});

test('different endpoints share an account dispatch limit and stale owners cannot overwrite new cache',()=>{
 const db=new Database(':memory:'),state=new ProviderState(db);
 try{
  assert.equal(state.acquire('a','weibohot',start,90,'old').kind,'reserved');
  assert.equal(state.acquire('a','nethot',start,90,'other').kind,'wait');
  assert.equal(state.acquire('a','nethot',start+1000,90,'other').kind,'reserved');
  assert.equal(state.acquire('a','weibohot',start+31000,90,'new').kind,'reserved');
  assert.equal(state.complete('a','weibohot','new',start+31000,{version:'new'},start+100000),true);
  assert.equal(state.complete('a','weibohot','old',start,{version:'old'},start+100000),false);
  const cached=state.acquire('a','weibohot',start+32000,90,'read');
  assert.equal(cached.kind,'cached');if(cached.kind==='cached')assert.deepEqual(cached.payload,{version:'new'});
 }finally{db.close();}
});

test('cooldowns prevent repeated unauthorized calls and generation changes reject delayed cache writes',()=>{
 const db=new Database(':memory:'),state=new ProviderState(db);
 try{
  const generation=readGeneration(db);state.acquire('a','weibohot',start,90,'first',generation);
  state.fail('a','weibohot','first',start+3600000,'code=160',generation);
  assert.equal(state.acquire('a','weibohot',start+2000,90,'second').kind,'blocked');
  state.acquire('a','nethot',start+2000,90,'third',generation);
  acquireMaintenance(db,'test');advanceGeneration(db,'test');releaseMaintenance(db,'test');
  assert.throws(()=>state.complete('a','nethot','third',start+2000,{old:true},start+100000,generation),/数据版本/);
 }finally{db.close();}
});

test('provider metadata permits old databases but rejects incomplete provider backups',()=>{
 const db=new Database(':memory:');
 try{assert.doesNotThrow(()=>validateProviderSchema(db));new ProviderState(db);assert.doesNotThrow(()=>validateProviderSchema(db));
  db.exec('drop table provider_daily_usage');assert.throws(()=>validateProviderSchema(db),/provider_daily_usage|缺少/);
 }finally{db.close();}
});
