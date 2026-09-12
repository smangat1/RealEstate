import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { dismissRadarLead } from "@/lib/scout-engine";

// POST /api/mobile/boards/[id]/scout/radar/[leadId]/dismiss
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { leadId } = await params;
    const success = await dismissRadarLead(leadId, user.id);
    return NextResponse.json({ success });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dismiss lead.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to dismiss lead." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
