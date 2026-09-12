import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getScoutRadarLeads } from "@/lib/scout-engine";

// GET /api/mobile/boards/[id]/scout/radar — fetch pending radar leads
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: boardId } = await params;
  const leads = await getScoutRadarLeads(boardId);
  return NextResponse.json({ leads });
}
