import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationMaterials,publicationTextFiles} from '../src/lib/publications/materials';
import {publicationLink} from '../src/lib/publications/links';
const reference={id:'a'.repeat(24),reference:'AAAAAAAA',path:'/p/'+'a'.repeat(24)};
test('posting materials have one language-specific source link and mention comments only when available',()=>{
 const english=publicationMaterials(reference,'https://wccat.example','en',false),chinese=publicationMaterials(reference,'https://wccat.example','zh',true);
 assert.equal(english.url,'https://wccat.example/p/'+reference.id+'?lang=en');
 assert.doesNotMatch(english.reply,/comments|sources\.txt/);assert.match(chinese.reply,/评论/);assert.match(chinese.url,/lang=zh$/);
 assert.equal((english.reply.match(/https:\/\//g)||[]).length,1);
 const files=publicationTextFiles(reference,'https://wccat.example',{en:false,zh:true});assert.deepEqual(files.map(f=>f.name),['source-reply-en.txt','source-reply-zh.txt','publication.txt']);
 assert.throws(()=>publicationMaterials({...reference,path:'https://evil.test'},'https://wccat.example','en',false),/资料/);
});
test('source labels distinguish forum posts, search results and original reporting',()=>{
 const link=(sourceId:string,url:string)=>publicationLink({sourceId,sourceName:sourceId,title:'Source',url})!;
 assert.equal(link('hupu','https://bbs.hupu.com/643288637.html').kind,'post');
 assert.equal(link('weibo','https://s.weibo.com/weibo?q=test').kind,'search');
 assert.equal(link('douyin','https://www.douyin.com/hot/12345').kind,'topic');
 assert.equal(link('qq-news','https://new.qq.com/rain/a/20261125A04GH900').kind,'article');
});
