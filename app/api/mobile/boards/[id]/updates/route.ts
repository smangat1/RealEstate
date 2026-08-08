import { NextResponse } from "next/server";
import { z } from "zod";

import { addBoardDecision, addManualBoardUpdate, getBoardPageData, resolveBoardDecision } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), content: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("open_decision"), question: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("resolve_decision"), question: z.string().trim().min(1).max(1000), resolution: z.string().trim().max(2000).optional() }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid board update." }, { status: 400 });

    if (parsed.data.action === "update") {
      await addManualBoardUpdate(
        id,
        { userId: user.id, authorName: user.displayName },
        parsed.data.content,
      );
    }
    if (parsed.data.action === "open_decision") await addBoardDecision(id, user.displayName, parsed.data.question);
    if (parsed.data.action === "resolve_decision") await resolveBoardDecision(id, user.displayName, parsed.data.question, parsed.data.resolution);

    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update board.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
