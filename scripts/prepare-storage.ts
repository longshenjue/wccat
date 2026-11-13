import './load-env';
import {maintainStorage} from '../src/lib/data-cleanup';
maintainStorage('prepare',message=>console.log('[WcCAT]',message)).then(()=>console.log('[WcCAT] Incremental space reclamation ready; all business records retained.')).catch(error=>{console.error(error.message);process.exitCode=1;});

