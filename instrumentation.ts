import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      try {
        const { ensureListingImageBucketIsPrivate } = await import("./lib/listing-image-storage");
        await ensureListingImageBucketIsPrivate();
      } catch (error) {
        Sentry.captureException(error, { tags: { "homeboard.operation": "secure_listing_image_bucket" } });
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
