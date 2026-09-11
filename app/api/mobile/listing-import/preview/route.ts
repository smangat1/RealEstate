import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { previewListingImport } from "@/lib/listing-sources";
import { isSafeHttpUrl } from "@/lib/input-safety";

const schema = z.object({
  url: z.string().trim().max(2_000).refine(isSafeHttpUrl),
  address: z.string().trim().max(300).nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  price: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  bedrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
  bathrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Paste a valid http or https listing URL." }, { status: 400 });
    }
    return NextResponse.json(previewListingImport(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect this listing link.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Sign in to import a listing." : "Unable to inspect this listing link." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
