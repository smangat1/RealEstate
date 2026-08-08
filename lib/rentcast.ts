import "server-only";

import {
  completeRentCastRequest,
  reserveRentCastRequest,
} from "@/lib/provider-request-budget";
import { RentCastClient } from "@/lib/rentcast-client";

export function isRentCastConfigured() {
  return Boolean(process.env.RENTCAST_API_KEY?.trim());
}
export function getRentCastClient() {
  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) return null;

  return new RentCastClient({
    apiKey,
    gate: {
      reserve: reserveRentCastRequest,
      complete: completeRentCastRequest,
    },
  });
}
