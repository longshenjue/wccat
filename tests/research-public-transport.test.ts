import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function simulate(mode:'gzip'|'204'|'205'|'304'){
 const script=`
 const https=require('node:https'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
 const events=[];process.on('uncaughtException',e=>events.push(e.message));
 https.request=(_url,options,callback)=>{const req=new EventEmitter(),res=new PassThrough();res.statusCode=${mode==='gzip'?200:Number(mode)};res.headers={'content-type':'text/html',${mode==='gzip'?"'content-encoding':'gzip'":''}};
 req.end=()=>queueMicrotask(()=>{callback(res);${mode==='gzip'?"res.write(Buffer.from('1f8b0800000000000003','hex'));":"res.end();"}});
 options.signal.addEventListener('abort',()=>{req.emit('error',Object.assign(new Error('aborted'),{name:'AbortError'}));res.destroy(Object.assign(new Error('aborted'),{code:'ECONNRESET'}));});return req;};
 const {readPublicResearchText}=require('./src/lib/topic-sharing/research/public-fetch.ts');let settled=false;
 readPublicResearchText('https://example.com/article',{signal:AbortSignal.timeout(80),resolve:async()=>[{address:'8.8.8.8',family:4}]}).then(()=>settled=true,()=>settled=true);
 setTimeout(()=>{process.stdout.write(JSON.stringify({settled,events}));process.exit(0);},250);
 `;
 const result=spawnSync(process.execPath,['--import','tsx','--eval',script],{cwd:process.cwd(),encoding:'utf8',timeout:2500});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout) as {settled:boolean;events:string[]};
}
test('pinned compressed HTTP reads settle on abort without an uncaught source-stream error',()=>{
 assert.deepEqual(simulate('gzip'),{settled:true,events:[]});
});
test('empty-body HTTP statuses become ordinary retrieval failures instead of uncaught adapter exceptions',()=>{
 for(const status of ['204','205','304'] as const)assert.deepEqual(simulate(status),{settled:true,events:[]},status);
});
test('one megabyte of malformed markup cannot monopolize the research worker',()=>{
 const script=`const {extractResearchDocument}=require('./src/lib/topic-sharing/research/discovery.ts');for(const s of ['<'.repeat(999999),'<script>'.repeat(100000),'<meta '.repeat(160000)]){try{extractResearchDocument('https://example.com/article',s,'2026-11-27T00:00:00Z');}catch{}}process.stdout.write('finished');`;
 const result=spawnSync(process.execPath,['--import','tsx','--eval',script],{cwd:process.cwd(),encoding:'utf8',timeout:2500});
 assert.equal(result.status,0,String(result.error??result.stderr));assert.equal(result.stdout,'finished');
});
