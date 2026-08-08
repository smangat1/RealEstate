import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../lib/prisma";
import { getRentCastRequestUsage } from "../lib/provider-request-budget";

type SetupState = {
  requestTableReady: boolean;
  requestGuardReady: boolean;
  listingPayloadReady: boolean;
};

async function getSetupState(): Promise<SetupState> {
  const [state] = await prisma.$queryRaw<SetupState[]>`
    SELECT
      to_regclass('public."ProviderApiRequest"') IS NOT NULL AS "requestTableReady",
      EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'ProviderApiRequest_enforce_rentcast_limit'
          AND NOT tgisinternal
      ) AS "requestGuardReady",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Listing'
          AND column_name = 'providerData'
      ) AS "listingPayloadReady"
  `;

  return state;
}

async function main() {
  const apiKeyConfigured = Boolean(process.env.RENTCAST_API_KEY?.trim());
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

  if (!databaseConfigured) {
    throw new Error("DATABASE_URL is missing. No RentCast request was made.");
  }

  const setup = await getSetupState();
  const quota = setup.requestTableReady
    ? await getRentCastRequestUsage()
    : { used: 0, remaining: 0, limit: 50, windowDays: 32 };
  const ready =
    apiKeyConfigured &&
    setup.requestTableReady &&
    setup.requestGuardReady &&
    setup.listingPayloadReady;

  console.log(
    JSON.stringify(
      {
        rentCastRequestMade: false,
        apiKeyConfigured,
        databaseConfigured,
        ...setup,
        quota,
        readyForConfirmedImport: ready,
      },
      null,
      2,
    ),
  );

  if (!ready) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
