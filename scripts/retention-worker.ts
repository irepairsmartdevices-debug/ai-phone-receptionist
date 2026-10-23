import {pruneTranscripts} from '../src/persistence/retention';import {db} from '../src/persistence/db';
async function cleanup(){const deleted=await pruneTranscripts(new Date());console.log(`Retention cleanup completed (${deleted} expired messages removed).`);}
cleanup().then(async()=>{if(process.argv.includes('--once'))await db.end();else setInterval(()=>{void cleanup().catch(()=>console.error('Retention cleanup failed; retry scheduled.'));},3600000);}).catch(async()=>{console.error('Retention cleanup failed.');await db.end();process.exitCode=1;});
