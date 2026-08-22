import { ImageResponse } from "next/og";

import { getMarketingSlide } from "@/lib/marketing-slides";

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const slide = getMarketingSlide(requestUrl.searchParams.get("slide"));
  const logoUrl = new URL("/apple-icon.png", requestUrl.origin).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "62px 72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: slide.foreground,
          background: slide.background,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
            <div
              style={{
                width: "92px",
                height: "92px",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "24px",
                background: "#F4EADE",
                boxShadow: "0 12px 35px rgba(39,54,47,.16)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} width={64} height={64} alt="" />
            </div>
            <div style={{ fontSize: "25px", fontWeight: 800, letterSpacing: "8px" }}>HOMEBOARD</div>
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase" }}>
            {slide.label}
          </div>
        </div>

        <div style={{ maxWidth: "1020px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: slide.key === "problem" ? "64px" : "76px", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-3px" }}>
            {slide.title}
          </div>
          <div style={{ width: "94px", height: "8px", borderRadius: "99px", background: slide.accent }} />
          <div style={{ maxWidth: "890px", fontSize: "27px", lineHeight: 1.28, opacity: 0.82 }}>
            {slide.description}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
