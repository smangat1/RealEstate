import { NextResponse } from "next/server";

import { trackEvent } from "@/lib/analytics";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { isOperatorUser } from "@/lib/operator-access";
import { getRuntimeStatus } from "@/lib/runtime-status";

export async function GET() {
  if (!isAppEnabled()) {
    return NextResponse.json({ error: "Homeboard is currently disabled." }, { status: 403 });
  }

  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOperatorUser(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runtime = getRuntimeStatus();

  await trackEvent("runtime_status_viewed", {
    userId: currentUser.id,
    email: currentUser.email,
  });

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    runtime,
  });
}
