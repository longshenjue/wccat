import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('keyless status is diagnostic-only and check fails clearly without creating a database',()=>{
 const directory=mkdtempSync(join(tmpdir(),'wccat-tian-cli-'));
 const env={...process.env,TIANAPI_KEY:'',WCCAT_DATA_DIR:directory};
 try{
  const status=spawnSync(process.execPath,['--import','tsx','scripts/tianapi.ts','status'],{env,encoding:'utf8'});
  assert.equal(status.status,0,status.stderr);assert.deepEqual(JSON.parse(status.stdout),{configured:false,endpoints:[]});
  const check=spawnSync(process.execPath,['--import','tsx','scripts/tianapi.ts','check'],{env,encoding:'utf8'});
  assert.equal(check.status,1);assert.match(check.stderr,/TIANAPI_KEY/);
  assert.equal(existsSync(join(directory,'wccat.sqlite')),false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
