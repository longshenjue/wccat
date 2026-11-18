import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,snapshot} from './helpers/data-fixtures';

test('legacy v1 full archive still exports and validates while long-term evidence stays in the main library',async()=>{
 const ctx=await testDatabase();
 try{
  ctx.saveSnapshotToDb(snapshot('2026-11-01-08'));
  const {exportMonth}=await import('../src/lib/archive-export');
  const {validateArchive}=await import('../src/lib/archive-format');
  const {EvidenceStore}=await import('../src/lib/evidence-store');
  const archive=await exportMonth({start:'2026-11-01',end:'2026-11-01'},'full');
  assert.equal(validateArchive(archive.sqlitePath).schema,1);
  assert.equal(validateArchive(archive.sqlitePath).counts.snapshots,1);
  assert.equal(new EvidenceStore(ctx.getDb()).stats().tables.collection_runs,1);
 }finally{ctx.close();}
});
