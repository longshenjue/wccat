import test from 'node:test';
import assert from 'node:assert/strict';
import {safeResearchUrl,isPublicResearchAddress,readPublicResearchText,researchPinnedLookup} from '../src/lib/topic-sharing/research/public-fetch';
import {extractResearchDocument,parseSearchFeed,primarySourceLinks} from '../src/lib/topic-sharing/research/discovery';
import {researchTopicShare} from '../src/lib/topic-sharing/research';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';

const source=():TopicShareSource=>({ref:{kind:'daily',date:'2026-11-26',topicId:'iowa'},sourceKey:'a'.repeat(64),fingerprint:'b'.repeat(64),topicId:'iowa',title:'美国陆军在爱荷华州处置劣化叠氮化铅',date:'2026-11-26',observedAt:'2026-11-26T12:00:00Z',summary:'',detail:'',context:'',categories:['news'],rank:1,signal:'new',links:[]});
const article='<html><head><title>Army update on the Iowa ammunition plant</title><meta property="og:site_name" content="U.S. Army"></head><body><nav>Website navigation</nav><article><h1>Iowa plant update</h1><p>'+('The Army issued an update about the Iowa plant. Environmental sampling continues. ').repeat(8)+'</p></article><footer>Footer links</footer></body></html>';

test('research URLs and DNS addresses are public HTTPS only, including redirects and mapped IPv6',async()=>{
 assert.equal(safeResearchUrl('https://www.army.mil/article/123#part').href,'https://www.army.mil/article/123');
 for(const url of ['http://example.com','https://localhost/a','https://127.0.0.1/a','https://2130706433/a','https://[::1]/a','https://a:b@example.com/a','https://example.com:8443/a','file:///etc/passwd'])assert.throws(()=>safeResearchUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.5','192.168.1.1','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicResearchAddress(ip),false,ip);
 assert.equal(isPublicResearchAddress('8.8.8.8'),true);assert.equal(isPublicResearchAddress('2606:4700::1111'),true);
 const pinned=researchPinnedLookup({address:'8.8.8.8',family:4});
 pinned('example.com',{all:true},(error,value)=>{assert.equal(error,null);assert.deepEqual(value,[{address:'8.8.8.8',family:4}]);});
 pinned('example.com',{},(error,value,family)=>{assert.equal(error,null);assert.equal(value,'8.8.8.8');assert.equal(family,4);});
 let requests=0;
 await assert.rejects(readPublicResearchText('https://example.com',{resolve:async()=>[{address:'127.0.0.1',family:4}],request:async()=>{requests++;return new Response(article);}}));assert.equal(requests,0);
 await assert.rejects(readPublicResearchText('https://example.com',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/admin'}});}}));assert.equal(requests,1);
 await assert.rejects(readPublicResearchText('https://example.com',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>new Response('x'.repeat(200_001))}),/limit/i);
});

test('research extraction keeps actual article text and rejects verification pages; search hits are not article bodies',()=>{
 const doc=extractResearchDocument('https://www.army.mil/article/123',article,'2026-11-27T00:00:00Z');
 assert.equal(doc.publisher,'U.S. Army');assert.match(doc.text,/Environmental sampling continues/);assert.doesNotMatch(doc.text,/Website navigation|Footer links/);
 assert.throws(()=>extractResearchDocument('https://example.com','<title>Access Denied</title><p>Verify you are human</p>','2026-11-27T00:00:00Z'));
 const hits=parseSearchFeed('<rss><channel><item><title>Army &amp; EPA update</title><link>https://www.army.mil/article/123</link><description>Search snippet only</description></item></channel></rss>');
 assert.equal(hits.length,1);assert.equal(hits[0].snippet,'Search snippet only');assert.equal(hits[0].url,'https://www.army.mil/article/123');
 const tracked=parseSearchFeed('<rss><channel><item><title>EPA update</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fwww.epa.gov%2Fnewsreleases%2Fiowa</link></item></channel></rss>');assert.equal(tracked[0].url,'https://www.epa.gov/newsreleases/iowa');
});

test('generic agency homepages and unrelated news never become researched event evidence',async()=>{
 const result=await researchTopicShare(source(),{plan:async()=>({questions:[],anchors:['lead azide','Iowa'],queries:[{query:'Iowa lead azide',purpose:'event'}]}),search:async()=>[{title:'The Army home page',url:'https://www.army.mil/',snippet:'News from the Army'},{title:'Iowa lead azide',url:'https://www.army.mil/article/unrelated',snippet:'Iowa lead azide search snippet'}],read:async url=>({url,contentType:'text/html',text:'<title>New Army operations manual</title><article>'+('The Army issued operational guidance for a training exercise. ').repeat(20)+'</article>'})});
 assert.equal(result.research!.documents.length,0);assert.equal(result.research!.status,'unavailable');
});

test('independent event lookup avoids repeating the same anchor and prioritizes topic-specific original references',async()=>{
 const original=process.env.BRAVE_SEARCH_API_KEY;delete process.env.BRAVE_SEARCH_API_KEY;
 try{
  const queries:string[]=[];
  await researchTopicShare(source(),{plan:async()=>({questions:[],anchors:['lead azide','deteriorated lead azide','Iowa'],queries:[{query:'event update',purpose:'event'},{query:'official update',purpose:'event'}]}),search:async query=>{queries.push(query.query);return [];}});
  assert.deepEqual(queries,['event update','"lead azide" Iowa']);
  const links=primarySourceLinks('<a href="https://www.agency.gov/news/general-update">General</a><a href="https://www.agency.gov/news/other-update">Other</a><a href="https://www.agency.gov/news/iowa-lead-azide-update">Actual story</a>','https://example.com/article',['lead azide','Iowa']);
  assert.equal(links[0],'https://www.agency.gov/news/iowa-lead-azide-update');assert.equal(links.length,2);
 }finally{if(original===undefined)delete process.env.BRAVE_SEARCH_API_KEY;else process.env.BRAVE_SEARCH_API_KEY=original;}
});

test('the research request budget includes planning, discovery and failed document attempts',async()=>{
 let plans=0,searches=0,reads=0;
 const result=await researchTopicShare(source(),{plan:async()=>{plans++;return {questions:[],anchors:['Iowa'],queries:[1,2,3].map(i=>({query:`Iowa update ${i}`,purpose:'event' as const}))};},search:async()=>{searches++;return Array.from({length:4},(_,i)=>({title:'Iowa update',url:`https://source-${searches}-${i}.example.com/article`,snippet:'Iowa plant update'}));},read:async()=>{reads++;throw Error('HTTP 503');}});
 assert.ok(plans+searches+reads<=12,`used ${plans+searches+reads} requests`);assert.equal(result.research!.status,'unavailable');
});

test('explicit research freezes retrieved evidence and provenance with bounded queries, reads and failure warnings',async()=>{
 const original=source(),before=structuredClone(original);let searches=0,reads=0;
 const enriched=await researchTopicShare(original,{
  plan:async()=>({questions:['发生在哪里','官方后续监测是什么'],queries:[{query:'Iowa Army lead azide official update',purpose:'event'}]}),
  search:async()=>{searches++;return Array.from({length:20},(_,i)=>({title:`Iowa Army update ${i}`,url:`https://www.army.mil/article/${i}`,snippet:'Search snippet, not source evidence'}));},
  read:async url=>{reads++;return {url,contentType:'text/html',text:article};},now:()=>Date.parse('2026-11-27T00:00:00Z')
 });
 assert.deepEqual(original,before);assert.equal(enriched.baseFingerprint,original.fingerprint);assert.notEqual(enriched.fingerprint,original.fingerprint);
 assert.ok(searches<=3&&reads<=6);assert.ok(enriched.research!.documents.length>0);assert.match(enriched.research!.documents[0].text,/Environmental sampling/);assert.doesNotMatch(enriched.research!.documents[0].text,/Search snippet/);
 assert.equal(enriched.research!.checkedAt,'2026-11-27T00:00:00.000Z');
 const failed=await researchTopicShare(original,{plan:async()=>{throw Error('unavailable');},search:async()=>{throw Error('offline');},read:async()=>{throw Error('offline');}});
 assert.equal(failed.research!.status,'unavailable');assert.ok(failed.research!.warnings.length);assert.equal(failed.title,original.title,'lookup failure still leaves usable saved material');
});

test('configured search uses the official API without forwarding its secret to public fallback reads',async()=>{
 const {searchResearchSources}=await import('../src/lib/topic-sharing/research/search');
 const oldKey=process.env.BRAVE_SEARCH_API_KEY;process.env.BRAVE_SEARCH_API_KEY='private-test-key';
 try{
  let requests=0,reads=0;
  const options={signal:AbortSignal.timeout(1000),onApiRequest:()=>{requests++;},read:async(url:string)=>{reads++;assert.ok(!url.includes('private-test-key'));return {url,contentType:'text/xml',text:'<rss><channel><item><title>Iowa update</title><link>https://www.epa.gov/newsreleases/update</link></item></channel></rss>'};},fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{assert.ok(String(url).startsWith('https://api.search.brave.com/res/v1/web/search?'));assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('X-Subscription-Token'),'private-test-key');return new Response(null,{status:503});}};
  const result=await searchResearchSources({query:'Iowa latest update',purpose:'event'},options);
  assert.equal(requests,1);assert.equal(reads,1);assert.equal(result[0].url,'https://www.epa.gov/newsreleases/update');
 }finally{if(oldKey===undefined)delete process.env.BRAVE_SEARCH_API_KEY;else process.env.BRAVE_SEARCH_API_KEY=oldKey;}
});
