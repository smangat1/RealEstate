import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Homeboard",
    short_name: "Homeboard",
    description: "A shared place to save rental listings, compare real commutes, and understand the tradeoffs.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EADE",
    theme_color: "#3D504A",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
