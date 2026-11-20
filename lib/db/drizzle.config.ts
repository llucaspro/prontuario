import { defineConfig } from "drizzle-kit";
import path from "path";
import { getDatabaseConnectionString } from "./src/connection";

const connectionString = getDatabaseConnectionString();

if (!connectionString) {
  throw new Error(
    "Set SUPABASE_DATABASE_URL, NEON_DATABASE_URL, or provision a Replit database before running Drizzle.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
