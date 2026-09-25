import { NextResponse } from "next/server";
import { z } from "zod";

import {
  summarizeAdvisorGroupFinances,
  type AdvisorFinancialDisclosureMode,
} from "@/lib/advisor-finances";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const disclosureModes = ["available_on_request", "combined_range", "omit"] as const;

const updateSchema = z.object({
  disclosureMode: z.enum(disclosureModes),
  annualIncomeMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
  annualIncomeMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
  creditScoreMin: z.number().int().min(300).max(850).nullable().optional(),
  creditScoreMax: z.number().int().min(300).max(850).nullable().optional(),
  promptCompleted: z.boolean(),
}).superRefine((value, context) => {
  const ranges = [
    ["annualIncomeMax", value.annualIncomeMin ?? null, value.annualIncomeMax ?? null],
    ["creditScoreMax", value.creditScoreMin ?? null, value.creditScoreMax ?? null],
  ] as const;
  for (const [path, minimum, maximum] of ranges) {
    if ((minimum === null) !== (maximum === null)) {
      context.addIssue({ code: "custom", path: [path], message: "Both ends of the range are required." });
    } else if (minimum !== null && maximum !== null && minimum > maximum) {
      context.addIssue({ code: "custom", path: [path], message: "Range maximum must not be below its minimum." });
    }
  }
});

async function boardForViewer(boardId: string, userId: string) {
  return prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      OR: [
        { userId },
        { members: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      userId: true,
      members: { select: { userId: true } },
      advisorFinancialProfiles: {
        select: {
          userId: true,
          annualIncomeMin: true,
          annualIncomeMax: true,
          creditScoreMin: true,
          creditScoreMax: true,
        },
      },
    },
  });
}

function responsePayload(input: {
  board: NonNullable<Awaited<ReturnType<typeof boardForViewer>>>;
  mine: {
    annualIncomeMin: number | null;
    annualIncomeMax: number | null;
    creditScoreMin: number | null;
    creditScoreMax: number | null;
    disclosureMode: string;
    promptCompletedAt: Date | null;
  } | null;
}) {
  const memberIds = new Set(input.board.members.map((member) => member.userId));
  memberIds.add(input.board.userId);
  const group = summarizeAdvisorGroupFinances(
    input.board.advisorFinancialProfiles.filter((profile) => memberIds.has(profile.userId)),
    memberIds.size,
  );
  const mode = disclosureModes.includes(input.mine?.disclosureMode as AdvisorFinancialDisclosureMode)
    ? input.mine?.disclosureMode as AdvisorFinancialDisclosureMode
    : "available_on_request";

  return {
    mine: {
      annualIncomeMin: input.mine?.annualIncomeMin ?? null,
      annualIncomeMax: input.mine?.annualIncomeMax ?? null,
      creditScoreMin: input.mine?.creditScoreMin ?? null,
      creditScoreMax: input.mine?.creditScoreMax ?? null,
      disclosureMode: mode,
      promptCompletedAt: input.mine?.promptCompletedAt?.toISOString() ?? null,
    },
    group,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const board = await boardForViewer(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const mine = await prisma.advisorMemberFinancialProfile.findUnique({
      where: { boardId_userId: { boardId: id, userId: user.id } },
    });
    return NextResponse.json(responsePayload({ board, mine }));
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to load financial preferences." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Financial ranges are invalid." }, { status: 400 });
    }
    const board = await boardForViewer(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const mine = await prisma.advisorMemberFinancialProfile.upsert({
      where: { boardId_userId: { boardId: id, userId: user.id } },
      create: {
        boardId: id,
        userId: user.id,
        disclosureMode: parsed.data.disclosureMode,
        annualIncomeMin: parsed.data.annualIncomeMin ?? null,
        annualIncomeMax: parsed.data.annualIncomeMax ?? null,
        creditScoreMin: parsed.data.creditScoreMin ?? null,
        creditScoreMax: parsed.data.creditScoreMax ?? null,
        promptCompletedAt: parsed.data.promptCompleted ? new Date() : null,
      },
      update: {
        disclosureMode: parsed.data.disclosureMode,
        annualIncomeMin: parsed.data.annualIncomeMin ?? null,
        annualIncomeMax: parsed.data.annualIncomeMax ?? null,
        creditScoreMin: parsed.data.creditScoreMin ?? null,
        creditScoreMax: parsed.data.creditScoreMax ?? null,
        promptCompletedAt: parsed.data.promptCompleted ? new Date() : null,
      },
    });
    const refreshedBoard = await boardForViewer(id, user.id);
    if (!refreshedBoard) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json(responsePayload({ board: refreshedBoard, mine }));
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to save financial preferences." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
