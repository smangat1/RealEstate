"use client";

import React, { useState, useEffect } from "react";

export default function HomeboardPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [fontChoice, setFontChoice] = useState<"serif" | "sans" | "mono">("serif");
  const [fontSizeChoice, setFontSizeChoice] = useState(16);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPrivacyOpen(false);
        setIsShareModalOpen(false);
        setActiveMenu(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
                          cycleZoom();
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
                        Zoom: {zoomLevel}%
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
              {/* Zoom Button */}
              <button
                type="button"
                onClick={cycleZoom}
                title="Change Document Zoom"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontWeight: 500,
                  fontSize: "11px",
                  color: "#444746",
                  cursor: "pointer",
                }}
              >
                {zoomLevel}% ▾
              </button>

              {/* Font Selector Button */}
              <button
                type="button"
                onClick={cycleFont}
                title="Cycle Font Family (Serif / Sans / Mono)"
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontSize: "11px",
                  color: "#444746",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {fontChoice === "serif" ? "Georgia ▾" : fontChoice === "sans" ? "Sans ▾" : "Mono ▾"}
              </button>

              {/* Font Size Button */}
              <button
                type="button"
                onClick={cycleFontSize}
                title="Cycle Font Size"
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dadce0",
                  fontSize: "11px",
                  color: "#444746",
                  cursor: "pointer",
                }}
              >
                {fontSizeChoice} ▾
              </button>

              <span className="doc-desktop-only" style={{ color: "#dadce0", margin: "0 2px" }}>|</span>

              {/* Bold Button */}
              <button
                type="button"
                onClick={() => setIsBold(!isBold)}
                title="Toggle Bold"
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "12px",
                  backgroundColor: isBold ? "#d3e3fd" : "transparent",
                  border: isBold ? "1px solid #a8c7fa" : "1px solid transparent",
                  color: "#202124",
                  cursor: "pointer",
                }}
              >
                B
              </button>

              {/* Italic Button */}
              <button
                type="button"
                onClick={() => setIsItalic(!isItalic)}
                title="Toggle Italic"
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontStyle: "italic",
                  fontSize: "12px",
                  backgroundColor: isItalic ? "#d3e3fd" : "transparent",
                  border: isItalic ? "1px solid #a8c7fa" : "1px solid transparent",
                  color: "#202124",
                  cursor: "pointer",
                }}
              >
                I
              </button>

              {/* Underline Button */}
              <button
                type="button"
                onClick={() => setIsUnderline(!isUnderline)}
                title="Toggle Underline"
                className="doc-desktop-only"
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  textDecoration: "underline",
                  fontSize: "12px",
                  backgroundColor: isUnderline ? "#d3e3fd" : "transparent",
                  border: isUnderline ? "1px solid #a8c7fa" : "1px solid transparent",
                  color: "#202124",
                  cursor: "pointer",
                }}
              >
                U
              </button>
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
                  fontWeight: isBold ? 700 : 400,
                  fontStyle: isItalic ? "italic" : "normal",
                  textDecoration: isUnderline ? "underline" : "none",
                }}
              >
                <p style={{ margin: 0 }}>
                  it&apos;s always the same story.
                </p>

                <p style={{ margin: 0 }}>
                  you find an apartment on StreetEasy at midnight. you drop the link into iMessage—or bookmark it yourself. hours pass before everyone sees it. by the time you reach out the next day, forty other applicants have emailed the broker, the open house is full, and the listing is gone.
                </p>

                <p style={{ margin: 0 }}>
                  rental search in NYC is broken whether you&apos;re coordinating three roommates, moving with a partner, or searching solo. you have links scattered across chats, spreadsheets nobody maintains, and zero coordination when a good unit drops. by the time everyone agrees on who emails the broker and gathers their tax returns, someone else signs the lease.
                </p>

                <p style={{ margin: "6px 0 0 0", color: "#444746", fontWeight: 500 }}>
                  we built Homeboard around three things to fix this:
                </p>

                {/* Tabbed Document Blocks (No <ol>/<li> lists — clean indented tabs) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    margin: "4px 0 6px 0",
                  }}
                >
                  {/* Tabbed Item 1 */}
                  <div
                    style={{
                      paddingLeft: "28px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "6px",
                        top: "0",
                        color: "#9ca3af",
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: "13px",
                      }}
                      aria-hidden="true"
                    >
                      &gt;
                    </span>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>
                      AI broker pitch generator
                    </strong>{" "}
                    — drafts tailored agent inquiries in seconds with your verified income multiple, credit tiers, and target move-in date before the listing disappears.
                  </div>

                  {/* Tabbed Item 2 */}
                  <div
                    style={{
                      paddingLeft: "28px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "6px",
                        top: "0",
                        color: "#9ca3af",
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: "13px",
                      }}
                      aria-hidden="true"
                    >
                      &gt;
                    </span>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>
                      Shared document locker checklist
                    </strong>{" "}
                    — keeps W-2s, paystubs, IDs, and guarantor letters verified in one encrypted vault so nobody scrambles when an agent asks for a complete packet by 5 PM.
                  </div>

                  {/* Tabbed Item 3 */}
                  <div
                    style={{
                      paddingLeft: "28px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "6px",
                        top: "0",
                        color: "#9ca3af",
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: "13px",
                      }}
                      aria-hidden="true"
                    >
                      &gt;
                    </span>
                    <strong style={{ fontWeight: 700, color: "#1f1f1f" }}>
                      Apple Pay deposit splits
                    </strong>{" "}
                    — instant, equal holding deposit splits for roommate groups—or one-tap authorization for solo applicants—so nobody has to front $4,000 on a personal debit card.
                  </div>
                </div>

                {/* Universal Blue Hyperlink */}
                <p style={{ margin: "14px 0 0 0" }}>
                  we are onboarding NYC renters, couples, and roommate groups in rolling batches.{" "}
                  <a
                    href="mailto:early@homeboard.app?subject=Homeboard%20Early%20Access%20Request&body=Hi%20Homeboard%20team%2C%0A%0AI%20am%20looking%20for%20an%20apartment%20in%20NYC%20and%20would%20love%20early%20access.%0A%0AGroup%20size%20(solo%20or%20number%20of%20roommates)%3A%0ATarget%20move-in%20date%3A%0ABoroughs%2Fneighborhoods%3A"
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
        )}
      </div>
    </>
  );
}
