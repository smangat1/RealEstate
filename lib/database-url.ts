const SUPABASE_POOLER_SUFFIX = ".pooler.supabase.com";

export function getPrismaDatasourceUrl(
  databaseUrl = process.env.DATABASE_URL,
  serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
) {
  if (!databaseUrl || !serverless) {
    return databaseUrl;
  }

  try {
    const url = new URL(databaseUrl);

    if (!url.hostname.endsWith(SUPABASE_POOLER_SUFFIX)) {
      return databaseUrl;
    }

    if (!url.port || url.port === "5432") {
      url.port = "6543";
    }

    if (url.port !== "6543") {
      return databaseUrl;
    }

    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "1");

    return url.toString();
  } catch {
    return databaseUrl;
  }
}
