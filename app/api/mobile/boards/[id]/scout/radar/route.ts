import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { getScoutRadarLeads } from "@/lib/scout-engine";

// GET /api/mobile/boards/[id]/scout/radar: fetch pending radar leads
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireMobileAppUser(req);
    const { id: boardId } = await params;
    const leads = await getScoutRadarLeads(boardId);
    return NextResponse.json({ leads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load radar leads.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load radar leads." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
