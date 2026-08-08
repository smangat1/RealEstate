import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../lib/prisma";
import {
  completeRentCastRequest,
  getRentCastRequestUsage,
  reserveRentCastRequest,
} from "../lib/provider-request-budget";
import { RentCastClient } from "../lib/rentcast-client";
import {
  auditActiveRentCastCatalog,
  persistControlledRentCastRefresh,
} from "../lib/rentcast-import";

async function main() {
  if (
    !process.argv.includes("--confirm-one-request")
    || !process.argv.includes("--controlled-nyc-refresh")
  ) {
    throw new Error(
      "No request made. Re-run with --controlled-nyc-refresh --confirm-one-request only after every preflight check passes.",
    );
  }

  const city = "New York";
  const state = "NY";

  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) throw new Error("RENTCAST_API_KEY is missing from .env.local.");

  const before = await getRentCastRequestUsage();
  if (before.remaining < 1) {
    throw new Error(`No RentCast request slots remain (${before.used}/${before.limit} used).`);
  }

  console.log(
    `About to reserve exactly one request for ${city}, ${state}. ` +
      `${before.remaining}/${before.limit} Homeboard slots remain.`,
  );

  const client = new RentCastClient({
    apiKey,
    gate: {
      reserve: reserveRentCastRequest,
      complete: completeRentCastRequest,
    },
  });
  const result = await client.searchLongTermRentals({
    city,
    state,
    status: "Active",
    offset: 0,
  });
  const persisted = await persistControlledRentCastRefresh(result.listings);
  const after = await getRentCastRequestUsage();
  const audit = await auditActiveRentCastCatalog();

  console.log(
    JSON.stringify(
      {
        requestCount: 1,
        providerTotalCount: result.totalCount,
        ...persisted,
        quota: after,
        readOnlyAudit: audit,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
