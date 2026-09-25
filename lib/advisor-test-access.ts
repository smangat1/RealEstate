import "server-only";

import { isOperatorUser } from "@/lib/operator-access";

type AdvisorTestUser = {
  email?: string | null;
};

export function hasAdvisorTestAccess(user: AdvisorTestUser | null | undefined) {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.ADVISOR_TEST_MODE ?? "").trim().toLowerCase(),
  );
  return enabled && isOperatorUser(user);
}
