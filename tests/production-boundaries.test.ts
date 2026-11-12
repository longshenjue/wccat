import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from '../src/app/api/admin/db/route';
import {POST as analyze} from '../src/app/api/analyze-topic/route';

test('production does not expose any database admin method or on-demand AI generation',async t=>{
 const environment=process.env as Record<string,string|undefined>;
 const env=environment.NODE_ENV;
 environment.NODE_ENV='production';
 t.after(()=>{if(env===undefined)delete environment.NODE_ENV;else environment.NODE_ENV=env;});
 const cases=[['GET',admin.GET],['POST',admin.POST],['PATCH',admin.PATCH],['DELETE',admin.DELETE],['POST',analyze]] as const;
 for(const [method,handler] of cases) {
  const request=new Request('http://localhost/api/admin/db?table=__unknown',{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:'{}'})});
  const response=await handler(request);
  assert.equal(response.status,404,method);
  assert.deepEqual(await response.json(),{error:'Not found'});
 }
});
