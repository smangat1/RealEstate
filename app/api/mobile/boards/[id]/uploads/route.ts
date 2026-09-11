import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { getBoardPageData } from "@/lib/board-data";
import { assertThrottle } from "@/lib/action-throttle";
import { LISTING_IMAGE_BUCKET, signedListingImageUrl } from "@/lib/listing-image-urls";
import {
  ALLOWED_LISTING_IMAGE_TYPES,
  ensureListingImageBucketIsPrivate,
  MAX_LISTING_IMAGE_BYTES,
} from "@/lib/listing-image-storage";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_TYPES = new Set<string>(ALLOWED_LISTING_IMAGE_TYPES);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    try {
      assertThrottle({
        scope: "listing-image-upload",
        key: user.id,
        limit: 20,
        windowMs: 60 * 60 * 1_000,
        message: "Too many image uploads. Try again later.",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many image uploads." },
        { status: 429 },
      );
    }
    const { id } = await context.params;
    const board = await getBoardPageData(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_LISTING_IMAGE_BYTES + 512 * 1024) {
      return NextResponse.json({ error: "Images must be 8 MB or smaller." }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    if (file.size > MAX_LISTING_IMAGE_BYTES) return NextResponse.json({ error: "Images must be 8 MB or smaller." }, { status: 413 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, HEIC, or HEIF image." }, { status: 415 });

    await ensureListingImageBucketIsPrivate();

    const sourceBytes = Buffer.from(await file.arrayBuffer());
    let bytes: Buffer;
    try {
      bytes = await sharp(sourceBytes, { failOn: "error", limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width: 4_096, height: 4_096, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "Homeboard could not verify that image." }, { status: 415 });
    }
    const path = `${user.id}/${id}/${randomUUID()}.jpg`;
    const { error } = await supabaseAdmin.storage.from(LISTING_IMAGE_BUCKET).upload(path, bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    return NextResponse.json({ url: signedListingImageUrl(path) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload image.";
    const unauthorized = message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to upload image." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
