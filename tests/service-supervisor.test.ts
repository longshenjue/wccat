import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {superviseServices} from '../scripts/service-supervisor.mjs';

const command=(script:string)=>({name:'fixture',command:process.execPath,args:['-e',script]});

test('if a service exits unexpectedly, its sibling receives SIGTERM and the container fails',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'wccat-supervisor-'));
 const marker=path.join(directory,'terminated');
 const result=await superviseServices([
  command('setTimeout(()=>process.exit(2),500)'),
  command(`process.on('SIGTERM',()=>{require('fs').writeFileSync(${JSON.stringify(marker)},'yes');process.exit(0)});setInterval(()=>{},100)`)
 ],{gracePeriodMs:1000});
 assert.equal(result,2);
 assert.ok(existsSync(marker));
 rmSync(directory,{recursive:true,force:true});
});

test('AbortSignal stops all services cleanly',async()=>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),300);
 const result=await superviseServices([command('setInterval(()=>{},100)'),command('setInterval(()=>{},100)')],{signal:controller.signal,gracePeriodMs:1000});
 clearTimeout(timer);
 assert.equal(result,0);
});

test('an unstartable command fails and terminates any started siblings',async()=>{
 const result=await superviseServices([command('setInterval(()=>{},100)'),{name:'missing',command:'/definitely-not-a-wccat-executable',args:[]}],{gracePeriodMs:1000});
 assert.equal(result,1);
});

test('a hung service is killed after the shutdown grace period',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'wccat-supervisor-hung-'));
 const pidFile=path.join(directory,'pid');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),400);
 const result=await superviseServices([command(`require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},100)`)],{signal:controller.signal,gracePeriodMs:50});
 clearTimeout(timer);
 assert.equal(result,0);
 assert.ok(existsSync(pidFile));
 const pid=Number(readFileSync(pidFile,'utf8'));
 assert.throws(()=>process.kill(pid,0));
 rmSync(directory,{recursive:true,force:true});
});
