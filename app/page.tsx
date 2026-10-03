"use client";

import React, { useState, useEffect } from "react";

export default function HomeboardPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPrivacyOpen(false);
      }
    }
    if (isPrivacyOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isPrivacyOpen]);

  return (
    <>
      <style jsx global>{`
        :root {
          color-scheme: light !important;
        }
        html {
          font-size: 16px !important;
          background: #f0f2f5 !important;
          margin: 0;
          padding: 0;
        }
        body {
          margin: 0;
          padding: 0;
          background: #f0f2f5 !important;
          color: #1f2328 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        body::before {
          display: none !important;
        }
        * {
          box-sizing: border-box;
        }

        /* Responsive overrides */
        @media (max-width: 640px) {
          .doc-desktop-only {
            display: none !important;
          }
          .doc-sheet {
            margin: 0 !important;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
            padding: 24px 18px 48px 18px !important;
          }
          .doc-canvas {
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Full Window Shell styled like Google Docs / Word */}
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f0f2f5",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* ========================================================= */}
        {/* DOCUMENT HEADER / APPLICATION BAR (Google Docs / Word style) */}
        {/* ========================================================= */}
        <header
          style={{
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #dadce0",
            position: "sticky",
            top: 0,
            zIndex: 30,
            boxShadow: "0 1px 2px rgba(60,64,67,0.06)",
          }}
        >
          {/* Main App Bar Row */}
          <div
            style={{
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            {/* Left: Document Icon & Document Metadata */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Blue Document Page Icon */}
              <div
                style={{
                  width: "28px",
                  height: "36px",
                  backgroundColor: "#ffffff",
                  border: "1.5px solid #1a73e8",
                  borderRadius: "3px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "4px",
                  gap: "3px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                {/* Folded corner */}
                <div
                  style={{
                    position: "absolute",
                    top: "-1.5px",
                    right: "-1.5px",
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#f0f2f5",
                    borderBottom: "1.5px solid #1a73e8",
                    borderLeft: "1.5px solid #1a73e8",
                    borderTopRightRadius: "2px",
                  }}
                />
                {/* Document text lines */}
                <div style={{ width: "12px", height: "2px", backgroundColor: "#1a73e8", borderRadius: "1px" }} />
                <div style={{ width: "16px", height: "2px", backgroundColor: "#1a73e8", borderRadius: "1px" }} />
                <div style={{ width: "10px", height: "2px", backgroundColor: "#8ab4f8", borderRadius: "1px" }} />
              </div>

              {/* Title & Status */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#202124",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    apartment_search_brief
                  </span>
                  <span
                    style={{
                      backgroundColor: "#f1f3f4",
                      color: "#3c4043",
                      border: "1px solid #dadce0",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      padding: "1px 6px",
                      fontWeight: 500,
                    }}
                  >
                    read-only
                  </span>
                </div>

                {/* Submenu / Cloud Status */}
                <div
                  className="doc-desktop-only"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    fontSize: "12px",
                    color: "#5f6368",
                    marginTop: "2px",
                  }}
                >
                  <span style={{ cursor: "default" }}>File</span>
                  <span style={{ cursor: "default" }}>Edit</span>
                  <span style={{ cursor: "default" }}>View</span>
                  <span style={{ cursor: "default" }}>Tools</span>
                  <span style={{ color: "#dadce0" }}>|</span>
                  <span style={{ fontSize: "11px", color: "#70757a" }}>Saved to Homeboard Cloud</span>
                </div>
              </div>
            </div>

            {/* Right: Presence Avatars & Document Mode Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Presence indicators */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <div
                  title="Sam (Viewing)"
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    backgroundColor: "#1e8e3e",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #ffffff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                    zIndex: 2,
                  }}
                >
                  S
                </div>
                <div
                  title="Jordan (Viewing)"
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    backgroundColor: "#9334e6",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #ffffff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                    marginLeft: "-8px",
                    zIndex: 1,
                  }}
                >
                  J
                </div>
              </div>

              {/* View Only Chip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  backgroundColor: "#e8f0fe",
                  color: "#1967d2",
                  border: "1px solid #d2e3fc",
                  borderRadius: "16px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                <span>Viewing</span>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* DOCUMENT TOOLBAR RIBBON (Google Docs / Word Toolbar)      */}
          {/* ========================================================= */}
          <div
            style={{
              backgroundColor: "#edf2fa",
              borderTop: "1px solid #dadce0",
              padding: "4px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              color: "#444746",
            }}
          >
            {/* Toolbar Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" }}>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontWeight: 500,
                  fontSize: "11px",
                }}
              >
                100% ▾
              </span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontSize: "11px",
                }}
              >
                Georgia ▾
              </span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontSize: "11px",
                }}
              >
                11 ▾
              </span>
              <span className="doc-desktop-only" style={{ color: "#dadce0", margin: "0 2px" }}>|</span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "12px",
                }}
              >
                B
              </span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  fontStyle: "italic",
                  fontSize: "12px",
                }}
              >
                I
              </span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  textDecoration: "underline",
                  fontSize: "12px",
                }}
              >
                U
              </span>
              <span
                className="doc-desktop-only"
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  color: "#1a73e8",
                  fontWeight: 600,
                  fontSize: "12px",
                }}
              >
                A
              </span>
              <span style={{ color: "#dadce0", margin: "0 2px" }}>|</span>
              <span
                style={{
                  color: "#1a73e8",
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #d2e3fc",
                }}
              >
                🔗 Link mode
              </span>
            </div>

            {/* Document Status */}
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: "11px",
                color: "#5f6368",
                flexShrink: 0,
              }}
            >
              Homeboard · read-only
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* DOCUMENT CANVAS / DESK (Centering the white paper sheet)   */}
        {/* ========================================================= */}
        <main
          className="doc-canvas"
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            padding: "24px 16px 48px",
          }}
        >
          {/* Centered White Document Paper Sheet */}
          <article
            className="doc-sheet"
            style={{
              width: "100%",
              maxWidth: "760px",
              backgroundColor: "#ffffff",
              border: "1px solid #dadce0",
              borderRadius: "4px",
              boxShadow: "0 1px 3px 1px rgba(60,64,67,0.15), 0 1px 2px 0 rgba(60,64,67,0.3)",
              padding: "48px 56px 64px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              minHeight: "860px",
            }}
          >
            <div>
              {/* Document Header Metadata inside the paper */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #e8eaed",
                  paddingBottom: "8px",
                  marginBottom: "28px",
                  fontSize: "11px",
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  color: "#70757a",
                }}
              >
                <span>Homeboard · read-only</span>
                <span>last edited 12m ago</span>
              </div>

              {/* Document Title (Serif Editorial) */}
              <h1
                style={{
                  fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: "#202124",
                  letterSpacing: "-0.015em",
                  margin: "0 0 20px 0",
                }}
              >
                finding an apartment as a pair without losing your mind
              </h1>

              {/* Document Body: Candid, stream-of-consciousness, unpolished note */}
              <div
                style={{
                  fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
                  fontSize: "16px",
                  lineHeight: 1.75,
                  color: "#202124",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <p style={{ margin: 0 }}>
                  it&apos;s always the same story.
                </p>

                <p style={{ margin: 0 }}>
                  you find an apartment on StreetEasy at midnight. you drop the link into iMessage. your roommate hearts it four hours later while you&apos;re both at work. by lunch, forty other groups have emailed the listing agent, the open house slot is capped, and the link is buried under fifteen reels and a debate about commute times.
                </p>

                <p style={{ margin: 0 }}>
                  apartment hunting as a pair is broken because rental apps treat you like a single person living alone. in reality, you have three group chats, a spreadsheet nobody updates, and zero coordination when a good unit drops. by the time you agree on who is emailing the broker, the apartment is gone.
                </p>

                <p style={{ margin: "6px 0 0 0", color: "#444746", fontWeight: 500 }}>
                  we built Homeboard around three things to fix this:
                </p>

                {/* Numbered List of Core Functions */}
                <ol
                  style={{
                    margin: "2px 0 0 0",
                    paddingLeft: "22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <li style={{ paddingLeft: "4px" }}>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>AI broker pitch generator</strong> — drafts tailored agent inquiries in seconds with your combined income multiple, credit tiers, and target move-in date before the listing disappears.
                  </li>
                  <li style={{ paddingLeft: "4px" }}>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>Shared document locker checklist</strong> — keeps W-2s, paystubs, IDs, and guarantor letters verified in one encrypted vault so you aren&apos;t scrambling when an agent asks for docs by 5 PM.
                  </li>
                  <li style={{ paddingLeft: "4px" }}>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>50/50 Apple Pay deposit splits</strong> — instant, equal splits for good-faith holding deposits so neither roommate has to front $4,000 on a personal debit card.
                  </li>
                </ol>

                {/* Universal Blue Hyperlink */}
                <p style={{ margin: "14px 0 0 0" }}>
                  we are onboarding NYC roommate pairs in rolling batches.{" "}
                  <a
                    href="mailto:early@homeboard.app?subject=Homeboard%20Early%20Access%20Request&body=Hi%20Homeboard%20team%2C%0A%0AMy%20roommate%20and%20I%20are%20looking%20for%20an%20apartment%20in%20NYC%20and%20would%20love%20early%20access.%0A%0ANames%3A%0ATarget%20move-in%20date%3A%0ABoroughs%2Fneighborhoods%3A"
                    style={{
                      color: "#1a73e8",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    request early access
                  </a>{" "}
                  to join the private beta.
                </p>

                <p
                  style={{
                    margin: "10px 0 0 0",
                    fontSize: "12px",
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    color: "#70757a",
                    fontStyle: "italic",
                  }}
                >
                  typed quickly between open houses. updates added as we ship.
                </p>
              </div>
            </div>

            {/* ========================================================= */}
            {/* DOCUMENT FOOTER & FLOATING PRIVACY COMMENT BUBBLE         */}
            {/* ========================================================= */}
            <footer
              style={{
                marginTop: "48px",
                paddingTop: "16px",
                borderTop: "1px solid #e8eaed",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: "#70757a",
                position: "relative",
              }}
            >
              <span>Homeboard</span>

              {/* Universal Blue Hyperlink for Privacy Policy */}
              <div style={{ position: "relative" }}>
                {isPrivacyOpen && (
                  <div
                    role="dialog"
                    aria-label="Data Privacy Details"
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: 0,
                      marginBottom: "10px",
                      width: "320px",
                      maxWidth: "calc(100vw - 32px)",
                      backgroundColor: "#ffffff",
                      border: "1px solid #dadce0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 16px rgba(60,64,67,0.2), 0 1px 3px rgba(60,64,67,0.15)",
                      padding: "14px 16px",
                      textAlign: "left",
                      zIndex: 40,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {/* Comment Bubble Header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBottom: "8px",
                        marginBottom: "10px",
                        borderBottom: "1px solid #f1f3f4",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            backgroundColor: "#1a73e8",
                            color: "#ffffff",
                            fontSize: "10px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          H
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#202124" }}>
                          Homeboard Privacy
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#70757a",
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          }}
                        >
                          · note
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPrivacyOpen(false)}
                        style={{
                          color: "#70757a",
                          cursor: "pointer",
                          backgroundColor: "transparent",
                          border: "none",
                          fontSize: "14px",
                          padding: "2px 6px",
                          lineHeight: 1,
                        }}
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* 3 Privacy Bullets */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        fontSize: "12px",
                        lineHeight: 1.55,
                        color: "#3c4043",
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#202124", fontWeight: 600 }}>1. No selling data:</strong> We never sell search history, preferences, or contact info to brokerages or data brokers.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#202124", fontWeight: 600 }}>2. Encrypted doc vault:</strong> W-2s, paystubs, and IDs are AES-256 encrypted at rest and only decrypted when you submit an application.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#202124", fontWeight: 600 }}>3. Apple Pay token isolation:</strong> Deposit splits use device-level Apple Pay payment tokens—we never store or see bank numbers.
                      </p>
                    </div>

                    {/* Pointer Triangle Caret */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "-6px",
                        right: "24px",
                        width: "10px",
                        height: "10px",
                        backgroundColor: "#ffffff",
                        borderBottom: "1px solid #dadce0",
                        borderRight: "1px solid #dadce0",
                        transform: "rotate(45deg)",
                      }}
                      aria-hidden="true"
                    />
                  </div>
                )}

                <a
                  href="#privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsPrivacyOpen(!isPrivacyOpen);
                  }}
                  aria-expanded={isPrivacyOpen}
                  style={{
                    color: "#1a73e8",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 500,
                  }}
                >
                  Privacy Policy
                </a>
              </div>
            </footer>
          </article>
        </main>
      </div>
    </>
  );
}
