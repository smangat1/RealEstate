import { ImageResponse } from "next/og";

import { getInvitationByCode } from "@/lib/board-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shortReference(token: string) {
  const clean = token.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `HB-${clean.slice(-6) || "INVITE"}`;
}

export async function GET(request: Request) {
  const requestURL = new URL(request.url);
  const token = requestURL.searchParams.get("token")?.trim() || "";
  const inviteData = token ? await getInvitationByCode(token) : null;
  const active = Boolean(
    inviteData && !inviteData.wasExpired && inviteData.invitation.status === "pending",
  );
  const boardTitle = active && inviteData ? inviteData.board.title.slice(0, 70) : "A private Homeboard";
  const inviter = active && inviteData ? inviteData.invitedBy.displayName.slice(0, 54) : "Your rental group";
  const logoURL = new URL("/apple-icon.png", requestURL.origin).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "54px",
          color: "#293B34",
          background: "linear-gradient(145deg, #30463E 0%, #4D685E 100%)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            overflow: "hidden",
            borderRadius: "38px",
            background: "#F2E5D6",
            boxShadow: "0 26px 70px rgba(10, 24, 18, .28)",
          }}
        >
          <div
            style={{
              width: "67%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "48px 54px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              <div
                style={{
                  width: "76px",
                  height: "76px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "22px",
                  background: "#FBF4E9",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoURL} width={58} height={58} alt="" />
              </div>
              <div style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "7px" }}>HOMEBOARD</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ color: "#668073", fontSize: "18px", fontWeight: 800, letterSpacing: "4px" }}>
                {active ? "YOU ARE INVITED" : "PRIVATE INVITATION"}
              </div>
              <div style={{ maxWidth: "680px", fontSize: "61px", fontWeight: 750, lineHeight: 0.98, letterSpacing: "-2.5px" }}>
                {active ? `Join ${boardTitle}` : "Open Homeboard together"}
              </div>
              <div style={{ fontSize: "23px", color: "#5D7167" }}>
                {active ? `${inviter} shared a rental board with you.` : "Ask the board owner for a current link."}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "99px", background: "#5E9076" }} />
              <div style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "3px" }}>{shortReference(token)}</div>
            </div>
          </div>

          <div
            style={{
              width: "33%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "54px 42px",
              color: "#F7EDE0",
              background: "linear-gradient(155deg, #506D62, #30463E)",
            }}
          >
            <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "3px" }}>PRIVATE BOARD LINK</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
              {[
                ["01", "Open or install"],
                ["02", "Continue with Apple"],
                ["03", "Join the board"],
              ].map(([number, label]) => (
                <div key={number} style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                  <div style={{ color: "#CFE0D5", fontSize: "15px", fontWeight: 800 }}>{number}</div>
                  <div style={{ fontSize: "21px", fontWeight: 750 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ color: "rgba(247,237,224,.72)", fontSize: "16px", lineHeight: 1.35 }}>
              One search. Every tradeoff visible.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
