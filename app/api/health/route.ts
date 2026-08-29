import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getRuntimeStatus } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRuntimeStatus();
  const requiredConfigurationReady =
    runtime.appEnabled &&
    runtime.supabaseConfigured &&
    runtime.supabaseAdminConfigured &&
    runtime.databaseConfigured;

  let databaseReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  const ok = requiredConfigurationReady && databaseReady;
  return NextResponse.json(
    {
      ok,
      service: "homeboard",
      checks: {
        configuration: requiredConfigurationReady ? "ok" : "unavailable",
        database: databaseReady ? "ok" : "unavailable",
      },
      checkedAt: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
