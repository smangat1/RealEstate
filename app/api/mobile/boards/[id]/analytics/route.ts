import { NextResponse } from "next/server";
import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";

const schema = z.object({
  event: z.literal("listing_comparison_opened"),
  listingIds: z.array(z.string().trim().min(1).max(160)).min(2).max(3),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });

    await trackEvent(parsed.data.event, {
      boardId: id,
      userId: user.id,
      listingIds: parsed.data.listingIds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record the event.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
