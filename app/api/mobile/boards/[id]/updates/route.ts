import { after, NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { addManualBoardUpdate, getBoardPageData } from "@/lib/board-data";
import { notifyBoardChat } from "@/lib/apns";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { sendOperationalAlert } from "@/lib/monitoring";

const schema = z.object({
  action: z.literal("update"),
  content: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({
      scope: "mobile-board-update",
      key: `${user.id}:${id}`,
      limit: 60,
      windowMs: 10 * 60 * 1_000,
      message: "Too many board updates were sent recently. Please wait before trying again.",
    });
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid board update." }, { status: 400 });

    const content = parsed.data.content;
    await addManualBoardUpdate(
      id,
      { userId: user.id, authorName: user.displayName },
      content,
    );
    after(async () => {
      try {
        await notifyBoardChat({
          boardId: id,
          authorUserId: user.id,
          authorName: user.displayName,
          content,
        });
      } catch (error) {
        await sendOperationalAlert(error, {
          area: "push",
          operation: "notify_board_update",
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
      operation: "post_board_update",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to update board.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : isThrottleError(error)
            ? message
            : "Unable to update board.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}
