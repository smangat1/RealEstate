import { NextResponse } from "next/server";

import { API_VERSION, getServerCommit } from "@/lib/build-info";
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
  const betaReady = ok
    && runtime.errorMonitoringConfigured
    && runtime.operationalAlertsConfigured
    && runtime.boardChatPushConfigured
    && runtime.advisorAutomationConfigured;
  return NextResponse.json(
    {
      ok,
      betaReady,
      service: "homeboard",
      apiVersion: API_VERSION,
      serverCommit: getServerCommit(),
      checks: {
        configuration: requiredConfigurationReady ? "ok" : "unavailable",
        database: databaseReady ? "ok" : "unavailable",
      },
      capabilities: {
        errorMonitoring: runtime.errorMonitoringConfigured ? "configured" : "pending",
        operationalAlerts: runtime.operationalAlertsConfigured ? "configured" : "pending",
        boardChatPush: runtime.boardChatPushConfigured ? "configured" : "pending",
        advisorAutomation: runtime.advisorAutomationConfigured ? "configured" : "pending",
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
