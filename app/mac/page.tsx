"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function MacCompanionPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [fontChoice, setFontChoice] = useState<"serif" | "sans" | "mono">("sans");
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
          title: "Homeboard for Mac · mac_companion_brief",
          text: "Homeboard for Mac: Save rentals from your laptop to your shared board",
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

  const cycleFont = () => {
    if (fontChoice === "serif") setFontChoice("sans");
    else if (fontChoice === "sans") setFontChoice("mono");
    else setFontChoice("serif");
  };

  const getComputedFontFamily = () => {
    if (fontChoice === "sans") return 'Arial, Helvetica, sans-serif';
    if (fontChoice === "serif") return 'Georgia, Cambria, "Times New Roman", Times, serif';
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
          /* Keep the gray "desk" background visible so the white sheet reads as a document */
          .doc-canvas {
            padding: 12px 8px 48px !important;
            background: #f0f2f5 !important;
          }
          /* Sheet floats on the gray desk with shadow; this is what makes it feel like a doc */
          .doc-sheet {
            border-radius: 2px !important;
            border: 1px solid #dadce0 !important;
            box-shadow: 0 1px 4px rgba(60,64,67,0.18) !important;
            padding: 24px 20px 48px 20px !important;
            min-height: unset !important;
          }
          /* Hide toolbar ribbon entirely on mobile; Google Docs mobile does this */
          .doc-toolbar-ribbon {
            display: none !important;
          }
          /* Tighten header on mobile */
          .doc-header-bar {
            padding: 6px 12px !important;
          }
          /* Smaller title text on mobile */
          .doc-title-text {
            font-size: 13px !important;
          }
          /* Shrink Share button on mobile */
          .doc-share-btn {
            padding: 5px 12px !important;
            font-size: 12px !important;
          }
          /* Body text tightens on mobile like Google Docs */
          .doc-body-text {
            font-size: 15px !important;
            line-height: 1.6 !important;
            gap: 18px !important;
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
            className="doc-header-bar"
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
              {/* Homeboard Logo from Xcode */}
              <Link
                href="/"
                style={{
                  display: "flex",
                  alignItems: "center",
                  textDecoration: "none",
                  flexShrink: 0,
                }}
                aria-label="Homeboard home"
              >
                <Image
                  src="/brand/homeboard-mark.svg"
                  alt="Homeboard logo"
                  width={34}
                  height={35}
                  style={{
                    width: "32px",
                    height: "33px",
                    objectFit: "contain",
                    display: "block",
                  }}
                  priority
                />
              </Link>

              {/* Title, Badge & Functional Menu Bar */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    className="doc-title-text"
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#202124",
                      letterSpacing: "-0.01em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "220px",
                    }}
                  >
                    mac_companion_brief
                  </span>
                  <span
                    onClick={handleNoEditAccess}
                    title="Click for edit access options"
                    style={{
                      backgroundColor: "#f1f3f4",
                      color: "#3c4043",
                      border: "1px solid #dadce0",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      padding: "1px 6px",
                      fontWeight: 500,
                      cursor: "pointer",
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
                          setActiveMenu(null);
                          setShowEditAccessPopup(true);
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
                        Download Homeboard...
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
                className="doc-share-btn"
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
            className="doc-toolbar-ribbon"
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
                  <option value="sans">Arial</option>
                  <option value="serif">Georgia</option>
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
              onClick={handleNoEditAccess}
              title="Click for edit access options"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: "11px",
                color: "#5f6368",
                flexShrink: 0,
                cursor: "pointer",
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
              <div
                className="doc-body-text"
                style={{
                  fontFamily: getComputedFontFamily(),
                  fontSize: `${fontSizeChoice}px`,
                  lineHeight: 1.7,
                  color: "#202124",
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                  paddingTop: "12px",
                }}
              >
                <p style={{ margin: 0 }}>
                  we really meant it.
                </p>

                <p style={{ margin: 0 }}>
                  you can doomscroll almost any real estate listing thing, even between your laptop and phone.
                </p>

                <p style={{ margin: 0 }}>
                  find a place on your mac during work hours. tap save once, and the rent, layout, and pet policy jump straight onto your group&apos;s board.
                </p>

                <p style={{ margin: 0 }}>
                  no more pasting links into group chats, emailing yourself street addresses, or asking who found what.
                </p>

                <p style={{ margin: 0 }}>
                  everything stays in sync across your devices in real time so your crew can make moves before good units disappear.
                </p>

                <p style={{ margin: "4px 0 0 0" }}>
                  <a
                    href="#download"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowEditAccessPopup(true);
                    }}
                    style={{
                      color: "#1a73e8",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: `${fontSizeChoice}px`,
                      fontStyle: "italic",
                    }}
                  >
                    [try homeboard]
                  </a>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "#3c4043", lineHeight: 1.45 }}>
                      <div>
                        <strong style={{ color: "#202124" }}>1. zero tracking:</strong> we do not sell or monetize personal browsing history.
                      </div>
                      <div>
                        <strong style={{ color: "#202124" }}>2. secure sync:</strong> saved listings sync over encrypted channels between your devices.
                      </div>
                      <div>
                        <strong style={{ color: "#202124" }}>3. full control:</strong> delete your listings or group data anytime with one tap.
                      </div>
                    </div>

                    <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f1f3f4", textAlign: "right" }}>
                      <Link
                        href="/privacy"
                        style={{
                          fontSize: "11px",
                          color: "#1a73e8",
                          textDecoration: "underline",
                          fontWeight: 500,
                        }}
                      >
                        Read Full Privacy Policy →
                      </Link>
                    </div>

                    {/* Small speech-bubble triangle anchor */}
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
                  privacy policy
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-dialog-title"
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <h3
                  id="share-dialog-title"
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#202124",
                  }}
                >
                  Install Homeboard or Share Link
                </h3>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
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

              {/* Copy Link Section */}
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
                    value={typeof window !== "undefined" ? window.location.href : "https://real-estate-samyanmangat-6662s-projects.vercel.app/mac"}
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
                  padding: "12px 14px",
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
                  Install App or Companion
                </label>
                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#3c4043", lineHeight: 1.5 }}>
                  <strong>Mac:</strong> Open Homeboard for Mac to capture listings directly from your laptop.
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "#3c4043", lineHeight: 1.5 }}>
                  <strong>iOS:</strong> Tap the Share button <span style={{ fontFamily: "monospace" }}>[↑]</span> at the bottom of your browser, then tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="#1a73e8"
                      aria-hidden="true"
                    >
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                    </svg>
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
                      mac_companion_brief · read-only
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
                  margin: "0 0 14px 0",
                  fontSize: "13px",
                  color: "#3c4043",
                  lineHeight: 1.55,
                }}
              >
                You need to download Homeboard to access these features:
              </p>

              {/* Feature List */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px",
                  margin: "0 0 20px 0",
                  fontSize: "13px",
                  color: "#3c4043",
                  lineHeight: 1.5,
                }}
              >
                {[
                  ["doomscroll listings", "save from any platform, seamless Mac connection included"],
                  ["commute math", "door-to-door transit times for everyone"],
                  ["group shortlist", "vote and react on listings together"],
                  ["advisor", "automated outreach and texting with agents"],
                  ["stores nothing", "no data captured outside of saved listings"],
                ].map(([label, desc]) => (
                  <div key={label} style={{ display: "flex", gap: "6px" }}>
                    <span style={{ color: "#9aa0a6", flexShrink: 0 }}>–</span>
                    <span>
                      <strong style={{ fontWeight: 600, color: "#202124" }}>{label}:</strong>{" "}
                      {desc}
                    </span>
                  </div>
                ))}
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

                <button
                  type="button"
                  onClick={() => {
                    setShowEditAccessPopup(false);
                    setIsShareModalOpen(true);
                  }}
                  style={{
                    backgroundColor: "#1a73e8",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "8px 18px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1557b0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1a73e8")}
                >
                  Download Homeboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
