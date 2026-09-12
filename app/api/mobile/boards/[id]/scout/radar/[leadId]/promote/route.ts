import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promoteRadarLeadToShortlist } from "@/lib/scout-engine";

// POST /api/mobile/boards/[id]/scout/radar/[leadId]/promote
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { leadId } = await params;
  const success = await promoteRadarLeadToShortlist(leadId, session.user.id);
  return NextResponse.json({ success });
}
