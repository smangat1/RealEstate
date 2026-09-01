import "server-only";

import { isAppEnabled } from "@/lib/app-mode";
import { getCommuteServiceMode, type CommuteServiceMode } from "@/lib/commute-service";
import { isDemoModeEnabled } from "@/lib/demo-chat";
import { getOllamaRuntimeConfig } from "@/lib/ollama";

export type RuntimeStatus = {
  overallStatus: "healthy" | "partial";
  appEnabled: boolean;
  demoMode: boolean;
  supabaseConfigured: boolean;
  supabasePasswordRecoveryConfigured: boolean;
  supabaseAdminConfigured: boolean;
  databaseConfigured: boolean;
  ollamaConfigured: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaExtractModel: string;
  ollamaReplyModel: string;
  commuteMode: CommuteServiceMode;
  commuteConfigured: boolean;
  errorMonitoringConfigured: boolean;
  operationalAlertsConfigured: boolean;
  boardChatPushConfigured: boolean;
};

function hasValue(value?: string) {
  return Boolean(value?.trim());
}

export function getRuntimeStatus(): RuntimeStatus {
  const demoMode = isDemoModeEnabled();
  const ollama = getOllamaRuntimeConfig();
  const supabaseConfigured =
    hasValue(process.env.SUPABASE_URL) && hasValue(process.env.SUPABASE_PUBLISHABLE_KEY);
  const supabaseAdminConfigured =
    hasValue(process.env.SUPABASE_URL) && hasValue(process.env.SUPABASE_SECRET_KEY);
  const supabasePasswordRecoveryConfigured =
    hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    hasValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const databaseConfigured = hasValue(process.env.DATABASE_URL);
  const ollamaConfigured = hasValue(process.env.OLLAMA_URL) || hasValue(process.env.OLLAMA_MODEL);
  const commuteConfigured = hasValue(process.env.OPENROUTESERVICE_API_KEY);
  const errorMonitoringConfigured =
    hasValue(process.env.SENTRY_DSN) || hasValue(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const operationalAlertsConfigured =
    errorMonitoringConfigured || hasValue(process.env.HOMEBOARD_ALERT_WEBHOOK_URL);
  const boardChatPushConfigured =
    hasValue(process.env.APNS_KEY_ID)
    && hasValue(process.env.APNS_TEAM_ID)
    && hasValue(process.env.APNS_PRIVATE_KEY);
  const appEnabled = isAppEnabled();
  const commuteMode = getCommuteServiceMode(demoMode);
  const overallStatus =
    appEnabled && supabaseConfigured && supabaseAdminConfigured && databaseConfigured
      ? "healthy"
      : "partial";

  return {
    overallStatus,
    appEnabled,
    demoMode,
    supabaseConfigured,
    supabasePasswordRecoveryConfigured,
    supabaseAdminConfigured,
    databaseConfigured,
    ollamaConfigured,
    ollamaUrl: ollama.url,
    ollamaModel: ollama.model,
    ollamaExtractModel: ollama.extractModel,
    ollamaReplyModel: ollama.replyModel,
    commuteMode,
    commuteConfigured,
    errorMonitoringConfigured,
    operationalAlertsConfigured,
    boardChatPushConfigured,
  };
}
