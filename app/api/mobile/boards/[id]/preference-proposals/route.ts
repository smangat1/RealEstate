import { NextResponse } from "next/server";

import { serializePreferenceProposal } from "@/lib/advisor-preference-service";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const board = await getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const proposal = await prisma.advisorPreferenceProposal.findFirst({
      where: { boardId: id, userId: user.id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      preferenceProposal: proposal ? serializePreferenceProposal(proposal) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to load preference proposals." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
