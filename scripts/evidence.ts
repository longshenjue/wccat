import './load-env';
import {resolve} from 'node:path';
import {getDb} from '../src/lib/db';
import {dataDir} from '../src/lib/storage-paths';
import {EvidenceStore} from '../src/lib/evidence-store';
import {backupEvidenceDatabase,verifyEvidenceBackup,backfillEvidence} from '../src/lib/evidence-maintenance';

async function main() {
  const [action,...args]=process.argv.slice(2);
  if(action==='verify') {
    if(!args[0])throw new Error('Usage: npm run evidence -- verify /path/complete.sqlite');
    console.log(JSON.stringify(await verifyEvidenceBackup(resolve(args[0])),null,2));return;
  }
  if(!['stats','backup','backfill'].includes(action??''))throw new Error('Usage: npm run evidence -- stats | backup [directory] | backfill [--limit=5] [--force] | verify <file>');
  const db=getDb();
  try {
    if(action==='stats')console.log(JSON.stringify(new EvidenceStore(db).stats(),null,2));
    if(action==='backup')console.log(JSON.stringify(await backupEvidenceDatabase(db,resolve(args[0]??resolve(dataDir,'complete-backups'))),null,2));
    if(action==='backfill')console.log(JSON.stringify(backfillEvidence(db,{limit:Number(args.find(arg=>arg.startsWith('--limit='))?.split('=')[1]??5),force:args.includes('--force')}),null,2));
  }finally{db.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Evidence command failed');process.exitCode=1;});
