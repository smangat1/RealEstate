import "server-only";

import {
  connect,
  constants,
  type ClientHttp2Session,
} from "node:http2";

import { createAPNsProviderToken } from "@/lib/apns-token";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

type APNsEnvironment = "development" | "production";

type APNsDevice = {
  id: string;
  token: string;
  environment: string;
};

type APNsResponse = {
  status: number;
  reason?: string;
};

type ProviderCredentials = {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
};

export type BoardPushType =
  | "board_chat"
  | "advisor_follow_up"
  | "listing_change"
  | "negotiation_comp"
  | "scam_warning"
  | "advisor_group_nag";

let cachedProviderToken: { value: string; issuedAt: number } | null = null;

function normalizePrivateKey(value: string) {
  const expanded = value.replace(/\\n/g, "\n").trim();
  if (expanded.includes("BEGIN PRIVATE KEY")) return expanded;

  try {
    const decoded = Buffer.from(expanded, "base64").toString("utf8").trim();
    return decoded.includes("BEGIN PRIVATE KEY") ? decoded : expanded;
  } catch {
    return expanded;
  }
}

function credentials(): ProviderCredentials | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();
  const topic = process.env.APNS_BUNDLE_ID?.trim() || "com.homeboard.native";
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey: normalizePrivateKey(privateKey), topic };
}

function providerToken(configuration: ProviderCredentials) {
  const now = Math.floor(Date.now() / 1_000);
  if (cachedProviderToken && now - cachedProviderToken.issuedAt < 50 * 60) {
    return cachedProviderToken.value;
  }

  const value = createAPNsProviderToken(configuration, now);
  cachedProviderToken = { value, issuedAt: now };
  return value;
}

function endpoint(environment: APNsEnvironment) {
  return environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

function sendToDevice(
  session: ClientHttp2Session,
  device: APNsDevice,
  jwt: string,
  topic: string,
  payload: string,
  collapseId?: string,
) {
  return new Promise<APNsResponse>((resolve) => {
    const headers: Record<string, string> = {
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${device.token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1_000) + 24 * 60 * 60),
    };
    if (collapseId) headers["apns-collapse-id"] = collapseId.slice(0, 64);
    const request = session.request(headers);
    let status = 0;
    let responseBody = "";
    const timeout = setTimeout(() => {
      request.close();
      resolve({ status: 0, reason: "TimedOut" });
    }, 8_000);

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[constants.HTTP2_HEADER_STATUS] || 0);
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ status: 0, reason: error.message });
    });
    request.on("end", () => {
      clearTimeout(timeout);
      let reason: string | undefined;
      try {
        reason = (JSON.parse(responseBody) as { reason?: string }).reason;
      } catch {
        reason = responseBody || undefined;
      }
      resolve({ status, reason });
    });
    request.end(payload);
  });
}

async function sendBatch(
  devices: APNsDevice[],
  environment: APNsEnvironment,
  configuration: ProviderCredentials,
  payload: string,
  collapseId?: string,
) {
  if (devices.length === 0) return [];
  const session = connect(endpoint(environment));
  session.on("error", () => {
    // Individual streams report the actionable failure to their response promise.
  });
  const jwt = providerToken(configuration);
  try {
    return await Promise.all(
      devices.map(async (device) => ({
        device,
        response: await sendToDevice(session, device, jwt, configuration.topic, payload, collapseId),
      })),
    );
  } finally {
    session.close();
  }
}

function isStaleToken(response: APNsResponse) {
  return response.status === 410
    || response.reason === "BadDeviceToken"
    || response.reason === "DeviceTokenNotForTopic"
    || response.reason === "Unregistered";
}

function notificationBody(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}…`;
}

export function isBoardChatPushConfigured() {
  return credentials() !== null;
}

export async function notifyBoardMembers(input: {
  boardId: string;
  type: BoardPushType;
  title: string;
  body: string;
  boardListingId?: string | null;
  excludeUserIds?: string[];
  collapseId?: string;
}) {
  const configuration = credentials();
  if (!configuration) return { configured: false, attempted: 0, delivered: 0 };

  const board = await prisma.searchBoard.findUnique({
    where: { id: input.boardId },
    select: {
      userId: true,
      members: { select: { userId: true } },
    },
  });
  if (!board) return { configured: true, attempted: 0, delivered: 0 };

  const excluded = new Set(input.excludeUserIds ?? []);
  const recipientIds = Array.from(
    new Set([board.userId, ...board.members.map((member) => member.userId)]),
  ).filter((userId) => !excluded.has(userId));
  if (recipientIds.length === 0) return { configured: true, attempted: 0, delivered: 0 };

  const devices = await prisma.pushDevice.findMany({
    where: {
      userId: { in: recipientIds },
      lastSeenAt: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1_000) },
    },
    select: { id: true, token: true, environment: true },
  });
  const payload = JSON.stringify({
    aps: {
      alert: {
        title: notificationBody(input.title),
        body: notificationBody(input.body),
      },
      sound: "default",
      "thread-id": `homeboard-${input.boardId}`,
    },
    type: input.type,
    boardId: input.boardId,
    ...(input.boardListingId ? { boardListingId: input.boardListingId } : {}),
  });

  const development = devices.filter((device) => device.environment !== "production");
  const production = devices.filter((device) => device.environment === "production");
  const results = (
    await Promise.all([
      sendBatch(development, "development", configuration, payload, input.collapseId),
      sendBatch(production, "production", configuration, payload, input.collapseId),
    ])
  ).flat();

  const staleDeviceIds = results
    .filter(({ response }) => isStaleToken(response))
    .map(({ device }) => device.id);
  if (staleDeviceIds.length > 0) {
    await prisma.pushDevice.deleteMany({ where: { id: { in: staleDeviceIds } } });
  }

  const failed = results.filter(({ response }) => response.status !== 200 && !isStaleToken(response));
  if (failed.length > 0) {
    await sendOperationalAlert(
      new Error(`APNs rejected ${failed.length} ${input.type} notification request(s).`),
      { area: "push", operation: `deliver_${input.type}`, severity: "error" },
    );
  }

  return {
    configured: true,
    attempted: results.length,
    delivered: results.filter(({ response }) => response.status === 200).length,
  };
}

export async function notifyBoardChat(input: {
  boardId: string;
  authorUserId: string;
  authorName: string;
  content: string;
}) {
  const board = await prisma.searchBoard.findUnique({
    where: { id: input.boardId },
    select: { title: true },
  });
  return notifyBoardMembers({
    boardId: input.boardId,
    type: "board_chat",
    title: `${input.authorName} in ${board?.title ?? "Homeboard"}`,
    body: input.content,
    excludeUserIds: input.authorUserId ? [input.authorUserId] : [],
  });
}
