import "server-only";

import { LISTING_IMAGE_BUCKET } from "@/lib/listing-image-urls";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const MAX_LISTING_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_LISTING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

let bucketSetup: Promise<void> | null = null;

export function ensureListingImageBucketIsPrivate() {
  if (bucketSetup) return bucketSetup;
  bucketSetup = (async () => {
    await supabaseAdmin.storage.createBucket(LISTING_IMAGE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_LISTING_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_LISTING_IMAGE_TYPES],
    });
    const { error } = await supabaseAdmin.storage.updateBucket(LISTING_IMAGE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_LISTING_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_LISTING_IMAGE_TYPES],
    });
    if (error) throw error;
  })().catch((error) => {
    bucketSetup = null;
    throw error;
  });
  return bucketSetup;
}
