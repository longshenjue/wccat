import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { selectImagePlan } from '../src/lib/shareen-image-geometry';
import { processShareEnImage } from '../src/lib/shareen-image-processor';
import { validateImageAsset } from '../src/lib/shareen-image-types';

const url = 'https://pic1.zhimg.com/subject.png';
const proposal = (extra = {}) => ({ mode: 'wide', protectedRegions: [{x:.72,y:.12,width:.12,height:.14}], focalPoint: {x:.78,y:.2}, confidence:.95, reason:'Protect subject', ...extra });
const source = () => sharp({create:{width:1600,height:1200,channels:3,background:'#102030'}}).composite([{input:Buffer.from('<svg width="1600" height="1200"><rect x="1152" y="144" width="192" height="168" fill="#ff0000"/></svg>')}]).png().toBuffer();
const reply = (value: unknown) => Response.json({id:'test',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});
function mockNetwork(t: TestContext, bytes: Buffer, value: unknown = proposal()) {
  let vision = 0, downloads = 0;
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis,'fetch',async (input: string | URL | Request, init?: RequestInit) => {
    if(String(input).startsWith('https://api.deepseek.com/')) { vision++; bodies.push(JSON.parse(String(init?.body))); return reply(value); }
    downloads++; return new Response(new Uint8Array(bytes), {headers:{'content-type':'image/png'}});
  });
  return {get vision(){return vision;},get downloads(){return downloads;},bodies};
}
function key(t: TestContext) { const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-secret';t.after(()=>{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}); }

test('off-centre crop contains subject and its 4 percent safety margin',()=>{
  const plan=selectImagePlan(1600,1200,proposal());
  assert.equal(plan.layout,'wide'); assert.ok(plan.crop);
  assert.ok(plan.crop.left<=1088 && plan.crop.left+plan.crop.width>=1408);
  assert.ok(plan.crop.top<=96 && plan.crop.top+plan.crop.height>=360);
  assert.ok(plan.crop.top<100, 'a central crop would cut the subject');
});
test('distant regions, bad coordinates, low confidence and excessive enlargement choose split',()=>{
  const cases=[proposal({protectedRegions:[{x:.1,y:0,width:.1,height:.1},{x:.8,y:.8,width:.1,height:.1}]}),proposal({confidence:.64}),proposal({protectedRegions:[]}),proposal({protectedRegions:[{x:NaN,y:0,width:.2,height:.2}]}),proposal({protectedRegions:[{x:.9,y:0,width:.2,height:.2}]}),proposal({focalPoint:{x:2,y:.5}}),null];
  for(const value of cases)assert.equal(selectImagePlan(1600,1200,value).layout,'split');
  assert.equal(selectImagePlan(300,200,proposal()).layout,'split');
});
test('wide output preserves real subject pixels, fixed dimensions, private bytes and bounded vision input',async t=>{
  key(t);const network=mockNetwork(t,await source());
  const asset=await processShareEnImage({url,title:'Subject at top right'});
  assert.ok(asset?.dataBase64);assert.equal(asset.layout,'wide');assert.equal(network.vision,1);
  const bytes=Buffer.from(asset.dataBase64,'base64');const metadata=await sharp(bytes).metadata();
  assert.deepEqual([metadata.width,metadata.height,metadata.format],[1072,360,'webp']);assert.ok(bytes.length<=512*1024);
  assert.equal(asset.id,createHash('sha256').update(bytes).digest('hex'));
  assert.ok(asset.crop);const x=Math.round((1248-asset.crop.left)*1072/asset.crop.width),y=Math.round((220-asset.crop.top)*360/asset.crop.height);
  const pixel=await sharp(bytes).extract({left:x,top:y,width:1,height:1}).raw().toBuffer();assert.ok(pixel[0]>220 && pixel[1]<30);
  const body=network.bodies[0] as {messages:Array<{content:unknown}>};
  const content=body.messages.at(-1)?.content as Array<{type:string;image_url?:{url:string}}>;
  const image=content.find(item=>item.type==='image_url')?.image_url?.url;assert.ok(image);assert.ok(image.startsWith('data:image/jpeg;base64,'));
  const input=await sharp(Buffer.from(image.split(',')[1],'base64')).metadata();assert.ok(Math.max(input.width!,input.height!)<=1280);
});
test('safe contain uses oriented EXIF dimensions and keeps source corners',async t=>{
  key(t);const bytes=await sharp({create:{width:800,height:400,channels:3,background:'#00ff00'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  mockNetwork(t,bytes,proposal({mode:'split'}));const asset=await processShareEnImage({url,title:'Portrait'});assert.ok(asset?.dataBase64);
  assert.deepEqual([asset.sourceWidth,asset.sourceHeight,asset.width,asset.height,asset.layout],[400,800,400,480,'split']);
  const output=Buffer.from(asset.dataBase64,'base64');assert.equal((await sharp(output).metadata()).orientation,undefined);
  const pixel=await sharp(output).extract({left:200,top:1,width:1,height:1}).raw().toBuffer();assert.ok(pixel[1]>220);
});
test('cache skips source and vision, force reprocesses and title changes invalidate it',async t=>{
  key(t);const network=mockNetwork(t,await source());const first=await processShareEnImage({url,title:'Original'});assert.ok(first);
  assert.deepEqual(await processShareEnImage({url,title:'Original',previous:first}),first);assert.equal(network.downloads,1);assert.equal(network.vision,1);
  await processShareEnImage({url,title:'Original',previous:first,force:true});assert.equal(network.vision,2);
  const changed=await processShareEnImage({url,title:'New title',previous:first});assert.equal(network.vision,3);assert.notEqual(changed?.requestKey,first.requestKey);
});
test('vision failure and missing key produce safe split without exposing private errors',async t=>{
  key(t);const logs:string[]=[];let vision=0;
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{if(String(input).includes('api.deepseek.com')){vision++;throw new Error('test-secret base64-private');}return new Response(new Uint8Array(await source()),{headers:{'content-type':'image/png'}});});
  const asset=await processShareEnImage({url,title:'Failure'},(_level,message)=>logs.push(message));assert.equal(asset?.layout,'split');assert.equal(vision,1);assert.ok(!logs.join().includes('test-secret'));assert.ok(!logs.join().includes('base64-private'));
  delete process.env.DEEPSEEK_API_KEY;await processShareEnImage({url,title:'No key'});assert.equal(vision,1);
});
test('source rejects forbidden redirects, too many hops, oversized bodies, invalid formats and excessive pixels',async t=>{
  key(t);let calls=0;
  const fixtures=[()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}),()=>new Response(null,{status:302,headers:{location:'/again'}}),()=>new Response(new Uint8Array(1),{headers:{'content-type':'image/png','content-length':String(6*1024*1024+1)}}),()=>new Response(new Uint8Array(6*1024*1024+1),{headers:{'content-type':'image/png'}}),()=>new Response('<svg width="100" height="100"/>',{headers:{'content-type':'image/svg+xml'}})];
  for(const fixture of fixtures){calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return fixture();});assert.equal(await processShareEnImage({url,title:'Invalid'}),undefined);assert.ok(calls<=4);t.mock.restoreAll();}
  const giant=await sharp({create:{width:4001,height:3000,channels:3,background:'red'}}).png().toBuffer();mockNetwork(t,giant);assert.equal(await processShareEnImage({url,title:'Giant'}),undefined);
});
test('source failure retains only a valid same-source private asset',async t=>{
  key(t);mockNetwork(t,await source());const previous=await processShareEnImage({url,title:'Original'});assert.ok(previous);t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
  assert.deepEqual(await processShareEnImage({url,title:'Changed',previous,force:true}),previous);
  assert.equal(await processShareEnImage({url:'https://pic1.zhimg.com/other.png',title:'Original',previous}),undefined);
});
test('browser-safe asset validation strips unknowns and rejects corrupt bounds, byte caps and URLs',async t=>{
  key(t);mockNetwork(t,await source());const asset=await processShareEnImage({url,title:'Validation'});assert.ok(asset);
  const cleaned=validateImageAsset({...asset,unknown:'private'});assert.ok(cleaned);assert.equal('unknown' in cleaned,false);
  for(const extra of [{id:'bad'},{sourceUrl:'https://attacker.example/a.png'},{width:42},{confidence:2},{dataBase64:'!bad'},{dataBase64:'A'.repeat(700000)},{crop:{left:-1,top:0,width:1,height:1}}])assert.equal(validateImageAsset({...asset,...extra}),undefined);
});

test('accepts a full-sized valid private byte encoding without validator stack overflow',async t=>{
  key(t);mockNetwork(t,await source());const asset=await processShareEnImage({url,title:'Large valid cache'});assert.ok(asset);
  assert.ok(validateImageAsset({...asset,dataBase64:Buffer.alloc(512*1024).toString('base64')}));
});

test('GIF first frame is processed and unsupported vision output cannot enable crop',async t=>{
  key(t);const first=await sharp({create:{width:800,height:800,channels:3,background:'#00ff00'}}).png().toBuffer();
  const second=await sharp({create:{width:800,height:800,channels:3,background:'#ff0000'}}).png().toBuffer();
  const gif=await sharp([first,second],{join:{animated:true}}).gif().toBuffer();
  const network=mockNetwork(t,gif,{mode:'wide',protectedRegions:[{x:-1,y:0,width:.2,height:.2}],confidence:1});
  const asset=await processShareEnImage({url,title:'GIF'});assert.ok(asset?.dataBase64);assert.equal(asset.layout,'split');assert.equal(network.vision,1);
  assert.deepEqual([(await sharp(Buffer.from(asset.dataBase64,'base64')).metadata()).width,asset.height],[400,480]);
  const pixel=await sharp(Buffer.from(asset.dataBase64,'base64')).extract({left:200,top:240,width:1,height:1}).raw().toBuffer();assert.ok(pixel[1]>220 && pixel[0]<30,'only the first green GIF frame is used');
});

test('source and vision deadlines abort stalled bodies and do not retry vision',async t=>{
  key(t);const bytes=await source();const deadlines:number[]=[];let vision=0;
  t.mock.method(AbortSignal,'timeout',(ms:number)=>{deadlines.push(ms);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10);timer.unref();return controller.signal;});
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{if(String(input).includes('api.deepseek.com')){vision++;return new Response(new ReadableStream());}return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png'}});});
  // Keep the event loop alive while mock deadlines use unref, like native AbortSignal.timeout.
  const keepAlive=setTimeout(()=>{},1000);t.after(()=>clearTimeout(keepAlive));
  assert.equal((await processShareEnImage({url,title:'Vision timeout'}))?.layout,'split');assert.equal(vision,1);assert.deepEqual(deadlines,[10000,30000]);
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream(),{headers:{'content-type':'image/png'}}));
  assert.equal(await processShareEnImage({url,title:'Source timeout'}),undefined);
});

test('wide crop rejects protection margins extending beyond any source edge',()=>{
  for(const region of [{x:.4,y:.01,width:.1,height:.1},{x:.01,y:.4,width:.1,height:.1},{x:.9,y:.4,width:.09,height:.1},{x:.4,y:.9,width:.1,height:.09}]) {
    assert.equal(selectImagePlan(1600,1200,proposal({protectedRegions:[region]})).layout,'split');
  }
});

test('wide cache validation enforces every protected subject, full safety margins and crop policy',async t=>{
  key(t);mockNetwork(t,await source());const asset=await processShareEnImage({url,title:'Safe cached crop'});assert.ok(asset?.crop);assert.equal(asset.layout,'wide');
  const cases=[
    {protectedRegions:[{x:.8,y:.8,width:.1,height:.1}]},
    {protectedRegions:[{x:.4,y:.01,width:.1,height:.1}]},
    {confidence:.1},
    {protectedRegions:[]},
    {protectedRegions:[{x:.5,y:.5,width:.001,height:.001}],crop:{left:600,top:550,width:500,height:168}},
    {crop:{left:0,top:0,width:1600,height:1200}}
  ];
  for(const extra of cases)assert.ok(validateImageAsset({...asset,...extra})===undefined,JSON.stringify(extra));
  // A syntactically valid private byte cache cannot avoid a fresh processing pass.
  const corrupted={...asset,confidence:.1};const network=mockNetwork(t,await source());
  const refreshed=await processShareEnImage({url,title:'Safe cached crop',previous:corrupted});assert.ok(refreshed);assert.equal(network.vision,1);assert.equal(refreshed.confidence,.95);
});

test('vision forbids 307/308 redirects and safely splits after exactly one request',async t=>{
  key(t);const bytes=await source();
  for(const status of [307,308]) {
    let vision=0;let redirect:RequestRedirect|undefined;
    t.mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{
      if(String(input).includes('api.deepseek.com')) {vision++;redirect=init?.redirect;return new Response(null,{status,headers:{location:'https://attacker.example/collect'}});}
      return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png'}});
    });
    const asset=await processShareEnImage({url,title:'Redirect blocked'});assert.equal(asset?.layout,'split');assert.equal(vision,1);assert.equal(redirect,'error');
    t.mock.restoreAll();
  }
});

test('no generated illustration is requested from a publisher-labelled input or any redirect hop',async t=>{
 key(t);
 const generator='https://image.pollinations.ai/prompt/test';
 const midway='https://p1.zhimg.com/another-hop';
 const requested:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:URL)=>{
  requested.push(String(input));
  if(String(input)===generator)return new Response('offline',{status:503});
  return new Response(null,{status:302,headers:{location:String(input)===url?midway:generator}});
 });
 assert.equal(await processShareEnImage({url:generator,sourceId:'zhihu',title:'Original'}),undefined);
 assert.deepEqual(requested,[]);
 assert.equal(await processShareEnImage({url,sourceId:'zhihu',title:'Original'}),undefined);
 assert.deepEqual(requested,[url,midway]);
});
