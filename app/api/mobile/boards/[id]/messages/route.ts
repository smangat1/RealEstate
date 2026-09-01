import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getBoardPageData, sendChat } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { notifyBoardChat } from "@/lib/apns";
import { sendOperationalAlert } from "@/lib/monitoring";

const schema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    if (!(await getBoardPageData(id, user.id))) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    await sendChat(id, parsed.data.content, { userId: user.id, authorName: user.displayName });
    after(async () => {
      try {
        await notifyBoardChat({
          boardId: id,
          authorUserId: user.id,
          authorName: user.displayName,
          content: parsed.data.content,
        });
      } catch (error) {
        await sendOperationalAlert(error, {
          area: "push",
          operation: "notify_board_message",
          severity: "error",
        });
      }
    });
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "post_board_message",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to send message.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
