import { Pool } from "pg";
const globalDb = globalThis as unknown as { receptionistPool?: Pool };
export const db =
  globalDb.receptionistPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 1000,
  });
if (process.env.NODE_ENV !== "production") globalDb.receptionistPool = db;
