import './load-env';
import {registerArchives} from '../src/lib/archive-catalog';
registerArchives(process.argv.slice(2)).then(results=>{for(const item of results)console.log(item.duplicate?'Already registered:':'Registered:',item.file);}).catch(error=>{console.error(error.message);process.exitCode=1;});

