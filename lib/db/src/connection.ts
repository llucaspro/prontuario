export function getDatabaseConnectionString(): string | undefined {
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (supabaseUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(supabaseUrl);
    } catch {
      throw new Error("SUPABASE_DATABASE_URL must be a PostgreSQL connection URI.");
    }

    if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
      throw new Error("SUPABASE_DATABASE_URL must use the PostgreSQL URI scheme.");
    }

    // Supabase's pooler uses a certificate chain Node does not trust by default.
    // Require an encrypted connection while keeping compatibility with pg's
    // libpq-style interpretation of sslmode=require.
    parsedUrl.searchParams.set("sslmode", "require");
    parsedUrl.searchParams.set("uselibpqcompat", "true");
    return parsedUrl.toString();
  }

  return process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
}
