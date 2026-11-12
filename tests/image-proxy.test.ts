import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAllowedImageUrl} from '../src/lib/image-proxy';

test('allows known image CDNs used by stored topics',()=>{
 for(const host of ['pic1.zhimg.com','i0.hdslb.com','imgpai.thepaper.cn','tiebapic.baidu.com','img.36krcdn.com','inews.gtimg.com','dingyue.ws.126.net','image.pollinations.ai'])assert.equal(parseAllowedImageUrl(`https://${host}/image.jpg`).hostname,host);
});
test('rejects arbitrary hosts, private endpoints, credentials and non-image ports',()=>{
 for(const url of ['http://127.0.0.1:6688/','http://169.254.169.254/','http://[::1]/','http://localhost/','https://example.com/a.jpg','https://zhimg.com.attacker.example/a.jpg','https://attackerzhimg.com/a.jpg','https://user:secret@pic1.zhimg.com/a.jpg','https://pic1.zhimg.com:6688/a.jpg'])assert.throws(()=>parseAllowedImageUrl(url),url);
});

test('a trusted CDN redirect cannot be followed into private network services',async t=>{
 const {GET}=await import('../src/app/api/image/route');
 const requests:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:URL)=>{
  requests.push(String(url));
  return new Response(null,{status:302,headers:{location:'http://127.0.0.1:6688/'}});
 });
 const response=await GET(new Request('http://localhost/api/image?url=https%3A%2F%2Fpic1.zhimg.com%2Fimage.jpg'));
 assert.equal(response.status,403);
 assert.deepEqual(requests,['https://pic1.zhimg.com/image.jpg']);
});
