import EmbeddedPostgres from 'embedded-postgres';
import {existsSync,mkdirSync} from 'node:fs';
const root=process.env.LOCAL_DB_DIR||'/workspace/.receptionist-db';mkdirSync(root,{recursive:true});
const pg=new EmbeddedPostgres({databaseDir:root,user:'receptionist',password:'local-development-only',port:55432,persistent:true,postgresFlags:['-h','127.0.0.1','-k','/tmp'],onLog:()=>{},onError:()=>{}});
if(!existsSync(`${root}/PG_VERSION`))await pg.initialise();
await pg.start();
for(const name of ['receptionist','repair_integration']){const c=pg.getPgClient();await c.connect();const found=await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[name]);await c.end();if(!found.rowCount)await pg.createDatabase(name);}
console.log('Local PostgreSQL ready on 127.0.0.1:55432 (development databases only).');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await pg.stop();process.exit(0);});
setInterval(()=>{},60000);
