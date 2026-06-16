import { NextResponse } from "next/server";

import { exportAnalyticsEventsAsCsv } from "@/lib/analytics";

export async function GET() {
  const csv = await exportAnalyticsEventsAsCsv();
  const timestamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homeboard-analytics-${timestamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
