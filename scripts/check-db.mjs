import { Pool } from "pg";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile?.(".env");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 1500,
});
try {
  await pool.query("SELECT 1");
  console.log("PostgreSQL is responding.");
} catch {
  console.error("PostgreSQL is not responding.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
