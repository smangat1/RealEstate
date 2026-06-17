import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function escapeCsv(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export async function GET() {
  const submissions = await prisma.waitlistSubmission.findMany({
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "id",
    "name",
    "email",
    "city",
    "moveInTimeline",
    "groupSize",
    "hasRoommates",
    "activelySearching",
    "willingToBetaTest",
    "willingToInviteRoommates",
    "biggestFrustration",
    "source",
    "createdAt",
  ];

  const rows = submissions.map((submission) =>
    [
      submission.id,
      submission.name,
      submission.email,
      submission.city,
      submission.moveInTimeline,
      submission.groupSize,
      submission.hasRoommates,
      submission.activelySearching,
      submission.willingToBetaTest,
      submission.willingToInviteRoommates,
      submission.biggestFrustration,
      submission.source,
      submission.createdAt.toISOString(),
    ]
      .map(escapeCsv)
      .join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homeboard-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
