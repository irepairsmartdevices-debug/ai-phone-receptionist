import {Pool} from 'pg';import {readFileSync,readdirSync} from 'node:fs';
process.loadEnvFile?.('.env');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(71501342)");for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())await client.query(readFileSync(`migrations/${name}`,'utf8'));await client.query('COMMIT');console.log('Database migrations applied.');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
