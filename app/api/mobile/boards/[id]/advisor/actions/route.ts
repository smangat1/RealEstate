import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { requireAdvisorBoardAccess } from "@/lib/advisor-auth";
import { getAdvisorActions, updateAdvisorActionStatus } from "@/lib/advisor-service";

const updateSchema = z.object({
  actionId: z.string().trim().min(1).max(160),
  status: z.enum(["completed", "dismissed"]),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    await requireAdvisorBoardAccess(id, user.id);
    const url = new URL(request.url);
    const actions = await getAdvisorActions({
      boardId: id,
      boardListingId: url.searchParams.get("boardListingId") || undefined,
      includeClosed: url.searchParams.get("includeClosed") === "true",
    });
    return NextResponse.json({ actions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Advisor actions.";
    const unauthorized = message === "MOBILE_AUTH_REQUIRED";
    const forbidden = message === "ADVISOR_BOARD_FORBIDDEN";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : forbidden ? "Board not found." : "Unable to load Advisor actions." },
      { status: unauthorized ? 401 : forbidden ? 404 : 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    await requireAdvisorBoardAccess(id, user.id);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid Advisor action update." }, { status: 400 });
    const updated = await updateAdvisorActionStatus({ boardId: id, ...parsed.data });
    if (!updated) return NextResponse.json({ error: "Advisor action not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Advisor action.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to update Advisor action." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
