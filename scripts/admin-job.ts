import './load-env';
import {runJob} from '../src/lib/admin-jobs';
runJob(process.argv[2]??'').catch(error=>{console.error(error.message);process.exitCode=1;});

