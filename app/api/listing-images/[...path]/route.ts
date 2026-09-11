import { NextResponse } from "next/server";

import {
  LISTING_IMAGE_BUCKET,
  verifyListingImageSignature,
} from "@/lib/listing-image-urls";
import { ensureListingImageBucketIsPrivate } from "@/lib/listing-image-storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await context.params;
  const path = parts.join("/");
  const url = new URL(request.url);
  const expiresAt = Number(url.searchParams.get("expires"));
  const suppliedSignature = url.searchParams.get("signature") ?? "";

  if (!verifyListingImageSignature(path, expiresAt, suppliedSignature)) {
    return NextResponse.json({ error: "This image link is invalid or expired." }, { status: 403 });
  }

  await ensureListingImageBucketIsPrivate();
  const { data, error } = await supabaseAdmin.storage
    .from(LISTING_IMAGE_BUCKET)
    .download(path);
  if (error || !data) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(data.size),
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
