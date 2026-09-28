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
  let advisorDraftPersistenceReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }
  if (databaseReady) {
    try {
      const [schema] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
        SELECT (
          to_regclass('"AdvisorMessagePayload"') IS NOT NULL
          AND to_regclass('"AdvisorMemberFinancialProfile"') IS NOT NULL
          AND to_regclass('"ListingSnapshot"') IS NOT NULL
          AND to_regclass('"ListingChange"') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'AdvisorSubscription'
              AND column_name = 'proactiveCheckedAt'
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'AdvisorSubscription'
              AND column_name = 'proactiveLeaseUntil'
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'BrokerOutreachRecord'
              AND column_name = 'advisorMessageId'
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'AdvisorMemberFinancialProfile'
              AND column_name = 'promptCompletedAt'
          )
          AND EXISTS (
            SELECT 1 FROM pg_type type
            JOIN pg_enum value ON value.enumtypid = type.oid
            WHERE type.typname = 'InquiryStatus' AND value.enumlabel = 'reported_sent'
          )
          AND EXISTS (
            SELECT 1 FROM pg_type type
            JOIN pg_enum value ON value.enumtypid = type.oid
            WHERE type.typname = 'AdvisorActionKind' AND value.enumlabel = 'negotiation_comp'
          )
        ) AS ready
      `;
      advisorDraftPersistenceReady = schema?.ready === true;
    } catch {
      advisorDraftPersistenceReady = false;
    }
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
        advisorDraftPersistence: advisorDraftPersistenceReady ? "ok" : "unavailable",
      },
      capabilities: {
        errorMonitoring: runtime.errorMonitoringConfigured ? "configured" : "pending",
        operationalAlerts: runtime.operationalAlertsConfigured ? "configured" : "pending",
        boardChatPush: runtime.boardChatPushConfigured ? "configured" : "pending",
        advisorAutomation: runtime.advisorAutomationConfigured ? "configured" : "pending",
        advisorDraftAcceptance: advisorDraftPersistenceReady,
      },
      routeMethods: {
        boardMessages: advisorDraftPersistenceReady ? ["POST", "PATCH"] : ["POST"],
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
