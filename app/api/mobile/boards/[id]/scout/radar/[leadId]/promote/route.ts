import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { promoteRadarLeadToShortlist } from "@/lib/scout-engine";

// POST /api/mobile/boards/[id]/scout/radar/[leadId]/promote
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { leadId } = await params;
    const success = await promoteRadarLeadToShortlist(leadId, user.id);
    return NextResponse.json({ success });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to promote lead.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to promote lead." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
