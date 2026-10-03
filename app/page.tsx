"use client";

import React, { useState, useEffect } from "react";

export default function HomeboardPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [fontChoice, setFontChoice] = useState<"serif" | "sans" | "mono">("serif");
  const [fontSizeChoice, setFontSizeChoice] = useState(16);
  const [showEditAccessPopup, setShowEditAccessPopup] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPrivacyOpen(false);
        setIsShareModalOpen(false);
        setActiveMenu(null);
        setShowEditAccessPopup(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNoEditAccess = () => {
    setShowEditAccessPopup(true);
  };

  const handleShareClick = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Homeboard · apartment_search_brief",
          text: "Homeboard: Finding an apartment without losing your mind",
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to modal if user cancelled or share failed
      }
    }
    setIsShareModalOpen(true);
  };

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const cycleZoom = () => {
    if (zoomLevel === 100) setZoomLevel(115);
    else if (zoomLevel === 115) setZoomLevel(125);
    else if (zoomLevel === 125) setZoomLevel(90);
    else setZoomLevel(100);
  };

  const cycleFont = () => {
    if (fontChoice === "serif") setFontChoice("sans");
    else if (fontChoice === "sans") setFontChoice("mono");
    else setFontChoice("serif");
  };

  const cycleFontSize = () => {
    if (fontSizeChoice === 16) setFontSizeChoice(18);
    else if (fontSizeChoice === 18) setFontSizeChoice(14);
    else setFontSizeChoice(16);
  };

  const getComputedFontFamily = () => {
    if (fontChoice === "serif") return 'Georgia, Cambria, "Times New Roman", Times, serif';
    if (fontChoice === "sans") return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  };

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

      {/* Main Document Editor Shell */}
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f0f2f5",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        onClick={() => {
          if (activeMenu) setActiveMenu(null);
          if (showEditAccessPopup) setShowEditAccessPopup(false);
        }}
      >
        {/* ========================================================= */}
        {/* TOP BAR / APPLICATION HEADER (Google Docs / Word Style)   */}
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
            {/* Left: Document Icon & Title */}
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
                <div style={{ width: "12px", height: "2px", backgroundColor: "#1a73e8", borderRadius: "1px" }} />
                <div style={{ width: "16px", height: "2px", backgroundColor: "#1a73e8", borderRadius: "1px" }} />
                <div style={{ width: "10px", height: "2px", backgroundColor: "#8ab4f8", borderRadius: "1px" }} />
              </div>

              {/* Title, Badge & Functional Menu Bar */}
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

                {/* Submenu Dropdowns (Functional) */}
                <div
                  className="doc-desktop-only"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "12px",
                    color: "#5f6368",
                    marginTop: "2px",
                    position: "relative",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === "file" ? null : "file");
                    }}
                    style={{
                      background: activeMenu === "file" ? "#f1f3f4" : "transparent",
                      border: "none",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "#444746",
                      cursor: "pointer",
                    }}
                  >
                    File
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === "view" ? null : "view");
                    }}
                    style={{
                      background: activeMenu === "view" ? "#f1f3f4" : "transparent",
                      border: "none",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "#444746",
                      cursor: "pointer",
                    }}
                  >
                    View
                  </button>

                  <span style={{ color: "#dadce0" }}>|</span>
                  <span style={{ fontSize: "11px", color: "#70757a" }}>Saved to Homeboard Cloud</span>

                  {/* File Dropdown Menu */}
                  {activeMenu === "file" && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #dadce0",
                        borderRadius: "6px",
                        boxShadow: "0 4px 12px rgba(60,64,67,0.18)",
                        padding: "6px 0",
                        minWidth: "180px",
                        zIndex: 50,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          window.print();
                          setActiveMenu(null);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 16px",
                          background: "none",
                          border: "none",
                          fontSize: "12px",
                          color: "#202124",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        Print / Save as PDF...
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCopyLink();
                          setActiveMenu(null);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 16px",
                          background: "none",
                          border: "none",
                          fontSize: "12px",
                          color: "#202124",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        Copy link
                      </button>
                    </div>
                  )}

                  {/* View Dropdown Menu */}
                  {activeMenu === "view" && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: "36px",
                        marginTop: "4px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #dadce0",
                        borderRadius: "6px",
                        boxShadow: "0 4px 12px rgba(60,64,67,0.18)",
                        padding: "6px 0",
                        minWidth: "160px",
                        zIndex: 50,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setZoomLevel(100);
                          setActiveMenu(null);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 16px",
                          background: "none",
                          border: "none",
                          fontSize: "12px",
                          color: "#202124",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {zoomLevel === 100 ? "Zoom: 100%" : "Reset Zoom to 100%"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          cycleFont();
                          setActiveMenu(null);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 16px",
                          background: "none",
                          border: "none",
                          fontSize: "12px",
                          color: "#202124",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        Switch Font
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Functional "Share / Install" Button */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={handleShareClick}
                style={{
                  backgroundColor: "#1a73e8",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "20px",
                  padding: "6px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1557b0")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1a73e8")}
              >
                <span>Share / Install</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* FUNCTIONAL TOOLBAR RIBBON (Google Docs / Word Toolbar)    */}
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
            {/* Functional Formatting Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", overflowX: "auto" }}>
              {/* Zoom Dropdown Select */}
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(Number(e.target.value))}
                  aria-label="Zoom level"
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    padding: "3px 20px 3px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #dadce0",
                    fontWeight: 500,
                    fontSize: "11px",
                    color: "#444746",
                    cursor: "pointer",
                    outline: "none",
                    lineHeight: "1.4",
                  }}
                >
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={90}>90%</option>
                  <option value={100}>100%</option>
                  <option value={115}>115%</option>
                  <option value={125}>125%</option>
                  <option value={150}>150%</option>
                  <option value={200}>200%</option>
                </select>
                <span
                  style={{
                    position: "absolute",
                    right: "6px",
                    pointerEvents: "none",
                    fontSize: "8px",
                    color: "#5f6368",
                  }}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </div>

              {/* Font Dropdown Select */}
              <div className="doc-desktop-only" style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  value={fontChoice}
                  onChange={(e) => setFontChoice(e.target.value as "serif" | "sans" | "mono")}
                  aria-label="Font family"
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    padding: "3px 20px 3px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #dadce0",
                    fontSize: "11px",
                    color: "#444746",
                    cursor: "pointer",
                    outline: "none",
                    lineHeight: "1.4",
                  }}
                >
                  <option value="serif">Georgia (Serif)</option>
                  <option value="sans">System (Sans)</option>
                  <option value="mono">Monospace</option>
                </select>
                <span
                  style={{
                    position: "absolute",
                    right: "6px",
                    pointerEvents: "none",
                    fontSize: "8px",
                    color: "#5f6368",
                  }}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </div>

              {/* Font Size Dropdown Select */}
              <div className="doc-desktop-only" style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  value={fontSizeChoice}
                  onChange={(e) => setFontSizeChoice(Number(e.target.value))}
                  aria-label="Font size"
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    padding: "3px 18px 3px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #dadce0",
                    fontSize: "11px",
                    color: "#444746",
                    cursor: "pointer",
                    outline: "none",
                    lineHeight: "1.4",
                  }}
                >
                  <option value={12}>12</option>
                  <option value={14}>14</option>
                  <option value={16}>16</option>
                  <option value={18}>18</option>
                  <option value={20}>20</option>
                  <option value={24}>24</option>
                </select>
                <span
                  style={{
                    position: "absolute",
                    right: "5px",
                    pointerEvents: "none",
                    fontSize: "8px",
                    color: "#5f6368",
                  }}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </div>

              <span className="doc-desktop-only" style={{ color: "#dadce0", margin: "0 2px" }}>|</span>

              {/* Formatting Controls Group (Triggers Centered Request Access Modal) */}
              <div
                className="doc-desktop-only"
                style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}
              >
                {/* Bold Button */}
                <button
                  type="button"
                  onClick={handleNoEditAccess}
                  title="Bold (Edit access required)"
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontWeight: 700,
                    fontSize: "12px",
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    color: "#444746",
                    cursor: "pointer",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#dadce0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  B
                </button>

                {/* Italic Button */}
                <button
                  type="button"
                  onClick={handleNoEditAccess}
                  title="Italic (Edit access required)"
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontStyle: "italic",
                    fontSize: "12px",
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    color: "#444746",
                    cursor: "pointer",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#dadce0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  I
                </button>

                {/* Underline Button */}
                <button
                  type="button"
                  onClick={handleNoEditAccess}
                  title="Underline (Edit access required)"
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    textDecoration: "underline",
                    fontSize: "12px",
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    color: "#444746",
                    cursor: "pointer",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#dadce0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  U
                </button>
              </div>
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
              zoom: `${zoomLevel}%`,
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

              {/* Document Title */}
              <h1
                style={{
                  fontFamily: getComputedFontFamily(),
                  fontSize: `${fontSizeChoice + 10}px`,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: "#202124",
                  letterSpacing: "-0.015em",
                  margin: "0 0 20px 0",
                }}
              >
                finding an apartment without losing your mind
              </h1>

              {/* Document Body: Candid, stream-of-consciousness, unpolished note */}
              <div
                style={{
                  fontFamily: getComputedFontFamily(),
                  fontSize: `${fontSizeChoice}px`,
                  lineHeight: 1.75,
                  color: "#202124",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <p style={{ margin: 0 }}>
                  imagine you and your friends are moving to nyc.
                </p>

                <p style={{ margin: 0 }}>
                  you find an apartment on StreetEasy at midnight. you drop the link into iMessage or WhatsApp. hours pass. someone is at work, someone is asleep, someone doesn&apos;t check the chat until lunch. by the time everyone sees it and agrees to tour, forty other applicants have already emailed the broker, the open house is full, and the listing is gone.
                </p>

                <p style={{ margin: 0 }}>
                  or you argue about whose commute is ruined—someone has a 20-minute straight shot on the express train, while someone else has an hour-long double transfer. and when a good place actually opens up, you scramble to track down who has their W-2s, who needs a guarantor, and who is going to front a $4,000 holding deposit on a personal debit card.
                </p>

                <p style={{ margin: 0 }}>
                  moving to NYC with friends is the ultimate stress test for apartment hunting—but the friction is the exact same everywhere.
                </p>

                <p style={{ margin: 0 }}>
                  whether you&apos;re coordinating three roommates, moving in with a partner in Chicago or SF, or searching solo for a studio where thirty other applicants are competing for the exact same door: rental search has turned into an unpaid, high-stress administrative job. links scattered across chats, dead spreadsheets nobody updates, and zero coordination when a good unit drops.
                </p>

                <p style={{ margin: 0 }}>
                  we built Homeboard as a single, real-time rental workspace to eliminate that chaos and give you an unfair speed advantage—no matter where you&apos;re looking or how many people are on your lease.
                </p>

                <p style={{ margin: "8px 0 0 0", color: "#444746", fontWeight: 600 }}>
                  how it actually works:
                </p>

                {/* Tabbed Document Blocks (Clean '-' dash bullets with compact document spacing) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    margin: "4px 0 8px 0",
                  }}
                >
                  {/* Step 1: One-tap Capture */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      one-tap listing capture from Safari &amp; rental apps:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      browse StreetEasy, Zillow, Redfin, or local brokerage sites like you normally do. instead of copying links or taking screenshots into a messy chat, tap the Homeboard Safari extension or iOS share sheet. it instantly reads the exact unit number, net vs. gross rent, broker fee status, pet policies, and floorplans, dropping a clean, structured card directly onto your shared board.
                    </span>
                  </div>

                  {/* Step 2: Commute calculations */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      automatic door-to-door commute calculation for everyone:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      each person sets their daily anchor—office, hospital, campus, or studio. the second a unit is added, Homeboard calculates real door-to-door transit times, exact subway or train lines, transfers, and walking distances for every single member (or just your own route if you&apos;re searching solo). no more opening Google Maps six times per listing to see if someone&apos;s commute is impossible.
                    </span>
                  </div>

                  {/* Step 3: Group shortlist & voting */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      unified shortlist, reactions, and dealbreaker filters:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      react, vote, and comment directly on the listing card. Homeboard scores listings across a six-dimension group-fit model—balancing budget caps, transit equity, square footage, and must-haves (laundry in building, natural light, dishwasher). you immediately see where the group aligns and never waste time touring a place someone secretly hates.
                    </span>
                  </div>

                  {/* Step 4: AI broker pitch generator */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      AI broker pitch generator:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      brokers in tight rental markets receive dozens of inquiries within an hour of posting and ignore generic &ldquo;is this available?&rdquo; messages. Homeboard drafts tailored, professional agent inquiries the second a listing drops. it automatically highlights your verified combined income multiple (confirming the 40x rent rule), credit score tiers, move-in readiness, and guarantor status—getting you to the top of the broker&apos;s inbox before open houses fill up.
                    </span>
                  </div>

                  {/* Step 5: Shared document locker */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      encrypted document locker checklist:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      in competitive rental markets, the first applicant to submit a 100% complete packet gets the lease. Homeboard provides an encrypted checklist vault for each searcher—keeping W-2s, recent paystubs, photo IDs, bank statements, and guarantor letters verified and ready. when you decide to apply, your entire packet is organized and ready to submit in 60 seconds without emailing sensitive financial docs over an unencrypted group chat.
                    </span>
                  </div>

                  {/* Step 6: Apple Pay deposit splits */}
                  <div
                    style={{
                      paddingLeft: "16px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "2px",
                        top: "0",
                        color: "#5f6368",
                        fontWeight: 600,
                      }}
                      aria-hidden="true"
                    >
                      -
                    </span>
                    <strong style={{ fontWeight: 600, color: "#1f1f1f" }}>
                      Apple Pay deposit splits &amp; one-tap approval:
                    </strong>{" "}
                    <span style={{ color: "#3c4043" }}>
                      when an agent demands a good-faith holding deposit or application fee on the spot, nobody has to front $4,000 on a personal debit card and chase down roommates on Venmo for two weeks. roommates authorize their exact split instantly via Apple Pay—or solo searchers approve with a single tap.
                    </span>
                  </div>
                </div>

                <p style={{ margin: "8px 0 0 0" }}>
                  the difference is speed and clarity. whether you&apos;re a group of friends moving into the city, a couple trying to stop arguing about transit lines, or a solo renter who needs to move faster than forty competitors: you move as a synchronized unit from the moment an apartment goes live to the moment you sign the lease.
                </p>

                {/* Universal Blue Hyperlink */}
                <p style={{ margin: "14px 0 0 0" }}>
                  we are onboarding renters, couples, and roommate groups in rolling batches.{" "}
                  <a
                    href="mailto:early@homeboard.app?subject=Homeboard%20Early%20Access%20Request&body=Hi%20Homeboard%20team%2C%0A%0AI%20am%20looking%20for%20an%20apartment%20and%20would%20love%20early%20access.%0A%0AGroup%20size%20(solo%2C%20couple%2C%20or%20number%20of%20roommates)%3A%0ACity%20%2F%20neighborhoods%3A%0ATarget%20move-in%20date%3A"
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

        {/* ========================================================= */}
        {/* SHARE / INSTALL MODAL DIALOG                              */}
        {/* ========================================================= */}
        {isShareModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(32, 33, 36, 0.4)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 60,
              padding: "16px",
            }}
            onClick={() => setIsShareModalOpen(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 28px rgba(0, 0, 0, 0.28)",
                width: "100%",
                maxWidth: "460px",
                padding: "20px 24px",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  borderBottom: "1px solid #e8eaed",
                  paddingBottom: "12px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#202124",
                  }}
                >
                  Share / Install Homeboard
                </h3>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "16px",
                    color: "#5f6368",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Share Section */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#5f6368",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "8px",
                  }}
                >
                  Share Document Link
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.href : "https://real-estate-samyanmangat-6662s-projects.vercel.app"}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: "13px",
                      borderRadius: "4px",
                      border: "1px solid #dadce0",
                      backgroundColor: "#f8f9fa",
                      color: "#3c4043",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                      backgroundColor: copiedLink ? "#1e8e3e" : "#1a73e8",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "background-color 150ms ease",
                    }}
                  >
                    {copiedLink ? "✓ Copied" : "Copy Link"}
                  </button>
                </div>
              </div>

              {/* Install Section */}
              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  border: "1px solid #e8eaed",
                  borderRadius: "6px",
                  padding: "14px 16px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#5f6368",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "6px",
                  }}
                >
                  Install App or Extension
                </label>
                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#3c4043", lineHeight: 1.5 }}>
                  <strong>iOS Safari:</strong> Tap the Share button <span style={{ fontFamily: "monospace" }}>[↑]</span> at the bottom of your browser, then tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "#3c4043", lineHeight: 1.5 }}>
                  <strong>Mac Safari:</strong> Visit <a href="/safari" style={{ color: "#1a73e8", textDecoration: "underline" }}>Homeboard for Safari</a> to install the extension.
                </p>
              </div>
            </div>
          </div>
        {/* ========================================================= */}
        {/* REQUEST ACCESS MODAL (Google Docs Style with Download)    */}
        {/* ========================================================= */}
        {showEditAccessPopup && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(32, 33, 36, 0.4)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 70,
              padding: "16px",
            }}
            onClick={() => setShowEditAccessPopup(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-access-dialog-title"
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 28px rgba(0, 0, 0, 0.28)",
                width: "100%",
                maxWidth: "460px",
                padding: "24px",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "#e8f0fe",
                      color: "#1a73e8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    🔒
                  </div>
                  <div>
                    <h3
                      id="request-access-dialog-title"
                      style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: 600,
                        color: "#202124",
                      }}
                    >
                      You need access
                    </h3>
                    <div style={{ fontSize: "12px", color: "#5f6368", marginTop: "2px" }}>
                      apartment_search_brief · read-only
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEditAccessPopup(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "18px",
                    color: "#5f6368",
                    cursor: "pointer",
                    padding: "4px",
                    lineHeight: 1,
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "13px",
                  color: "#3c4043",
                  lineHeight: 1.55,
                }}
              >
                Hey! You don&apos;t have edit access. You are viewing this document in read-only mode. You can request edit access from the team or download an offline copy for yourself.
              </p>

              {/* Download Option Box (Google Docs Style) */}
              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  border: "1px solid #dadce0",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#202124" }}>
                    Download offline copy
                  </div>
                  <div style={{ fontSize: "12px", color: "#5f6368" }}>
                    Save as PDF or print this brief
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.print();
                    setShowEditAccessPopup(false);
                  }}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#1a73e8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
                >
                  <span>Download as PDF ↓</span>
                </button>
              </div>

              {/* Footer Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEditAccessPopup(false)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#5f6368",
                    cursor: "pointer",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Cancel
                </button>

                <a
                  href="mailto:early@homeboard.app?subject=Homeboard%20Edit%20Access%20Request&body=Hi%20Homeboard%20team%2C%0A%0AI%20am%20viewing%20the%20Homeboard%20apartment%20search%20brief%20and%20would%20love%20edit%20access%20%2F%20early%20beta%20access.%0A%0AGroup%20size%20(solo%2C%20couple%2C%20or%20number%20of%20roommates)%3A%0ACity%20%2F%20neighborhoods%3A%0ATarget%20move-in%20date%3A"
                  onClick={() => setShowEditAccessPopup(false)}
                  style={{
                    backgroundColor: "#1a73e8",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "8px 18px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1557b0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1a73e8")}
                >
                  Request access
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
