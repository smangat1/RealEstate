import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const RENTCAST_HARD_REQUEST_LIMIT = 50;
export const RENTCAST_SAFETY_WINDOW_DAYS = 32;
export const BRAVE_HARD_REQUEST_LIMIT = 500;
export const BRAVE_SAFETY_WINDOW_DAYS = 32;

export type ProviderRequestReservation = {
  id: string;
  provider: "rentcast";
  operation: string;
  requestedAt: Date;
};

export type ProviderRequestCompletion = {
  status: "succeeded" | "failed";
  httpStatus?: number;
  resultCount?: number;
  errorMessage?: string;
};

export class ProviderRequestLimitError extends Error {
  constructor() {
    super(
      `RentCast is unavailable because Homeboard has reserved all ${RENTCAST_HARD_REQUEST_LIMIT} request slots in its safety window.`,
    );
    this.name = "ProviderRequestLimitError";
  }
}

export class BraveRequestLimitError extends Error {
  constructor() {
    super(
      `Brave Search is unavailable because Homeboard has reserved all ${BRAVE_HARD_REQUEST_LIMIT} request slots in its safety window.`,
    );
    this.name = "BraveRequestLimitError";
  }
}

function isRequestLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Homeboard RentCast request limit reached") ||
    message.includes("ProviderApiRequest_enforce_rentcast_limit")
  );
}

function isBraveRequestLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Homeboard Brave request limit reached")
    || message.includes("ProviderApiRequest_enforce_brave_limit")
  );
}

export async function reserveRentCastRequest(input: {
  operation: string;
  requestFingerprint?: string;
}): Promise<ProviderRequestReservation> {
  const id = randomUUID();

  try {
    const request = await prisma.providerApiRequest.create({
      data: {
        id,
        provider: "rentcast",
        operation: input.operation,
        requestFingerprint: input.requestFingerprint,
      },
      select: {
        id: true,
        provider: true,
        operation: true,
        requestedAt: true,
      },
    });

    return {
      ...request,
      provider: "rentcast",
    };
  } catch (error) {
    if (isRequestLimitError(error)) throw new ProviderRequestLimitError();
    throw error;
  }
}

export async function completeRentCastRequest(
  reservationId: string,
  completion: ProviderRequestCompletion,
) {
  await prisma.providerApiRequest.update({
    where: { id: reservationId },
    data: {
      status: completion.status,
      completedAt: new Date(),
      httpStatus: completion.httpStatus,
      resultCount: completion.resultCount,
      errorMessage: completion.errorMessage?.slice(0, 1000),
    },
  });
}

export async function reserveBraveRequest(input: {
  operation: string;
  requestFingerprint?: string;
}): Promise<Omit<ProviderRequestReservation, "provider"> & { provider: "brave" }> {
  const id = randomUUID();

  try {
    const request = await prisma.providerApiRequest.create({
      data: {
        id,
        provider: "brave",
        operation: input.operation,
        requestFingerprint: input.requestFingerprint,
      },
      select: {
        id: true,
        operation: true,
        requestedAt: true,
      },
    });
    return { ...request, provider: "brave" };
  } catch (error) {
    if (isBraveRequestLimitError(error)) throw new BraveRequestLimitError();
    throw error;
  }
}

export async function completeBraveRequest(
  reservationId: string,
  completion: ProviderRequestCompletion,
) {
  await prisma.providerApiRequest.update({
    where: { id: reservationId },
    data: {
      status: completion.status,
      completedAt: new Date(),
      httpStatus: completion.httpStatus,
      resultCount: completion.resultCount,
      errorMessage: completion.errorMessage?.slice(0, 1000),
    },
  });
}

export async function getRentCastRequestUsage() {
  const windowStartedAt = new Date(
    Date.now() - RENTCAST_SAFETY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const used = await prisma.providerApiRequest.count({
    where: {
      provider: "rentcast",
      requestedAt: { gte: windowStartedAt },
    },
  });

  return {
    used,
    remaining: Math.max(0, RENTCAST_HARD_REQUEST_LIMIT - used),
    limit: RENTCAST_HARD_REQUEST_LIMIT,
    windowDays: RENTCAST_SAFETY_WINDOW_DAYS,
  };
}

export async function getBraveRequestUsage() {
  const windowStartedAt = new Date(
    Date.now() - BRAVE_SAFETY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const used = await prisma.providerApiRequest.count({
    where: {
      provider: "brave",
      requestedAt: { gte: windowStartedAt },
    },
  });

  return {
    used,
    remaining: Math.max(0, BRAVE_HARD_REQUEST_LIMIT - used),
    limit: BRAVE_HARD_REQUEST_LIMIT,
    windowDays: BRAVE_SAFETY_WINDOW_DAYS,
  };
}
