import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getDatabaseConnectionString } from "./connection";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = getDatabaseConnectionString();

if (!connectionString) {
  throw new Error(
    "Set SUPABASE_DATABASE_URL, NEON_DATABASE_URL, or provision a Replit database before starting the app.",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
