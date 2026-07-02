import type { MetadataRoute } from "next";

import { shouldNoIndexSite } from "@/lib/site-visibility";

export default function robots(): MetadataRoute.Robots {
  if (shouldNoIndexSite()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
