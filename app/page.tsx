"use client";

import React, { useState, useEffect } from "react";

export default function HomeboardDocumentPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [showEarlyAccess, setShowEarlyAccess] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSamplePitch, setShowSamplePitch] = useState(false);

  // Close floating comment bubble on Escape key
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

  const handleEarlyAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitted(true);
  };

  return (
    <main
      className="min-h-screen w-full bg-zinc-100 flex flex-col items-center justify-start py-8 px-4 sm:py-14 sm:px-6 md:py-20 text-zinc-900"
      style={{
        backgroundColor: "#f4f4f5",
        color: "#18181b",
        fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
        minHeight: "100vh",
      }}
    >
      {/* Centered vertical white document paper sheet */}
      <article
        className="w-full max-w-2xl bg-white border border-zinc-200/90 rounded-sm shadow-sm p-7 sm:p-12 md:p-16 relative"
        style={{
          maxWidth: "42rem",
          backgroundColor: "#ffffff",
          borderColor: "#e4e4e7",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
          borderRadius: "2px",
        }}
      >
        {/* Header / Status indicator */}
        <header className="mb-8 sm:mb-10 select-none">
          <div
            className="font-mono text-xs text-zinc-400 tracking-tight flex items-center justify-between"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: "12px",
              color: "#a1a1aa",
            }}
          >
            <span>Homeboard · read-only</span>
            <span className="hidden sm:inline text-zinc-300">doc_id: hb_2026_note</span>
          </div>
        </header>

        {/* Note Title */}
        <h1
          className="text-2xl sm:text-3xl font-normal text-zinc-900 tracking-tight leading-snug mb-3"
          style={{
            fontSize: "1.75rem",
            lineHeight: 1.3,
            fontWeight: 400,
            color: "#18181b",
            letterSpacing: "-0.015em",
          }}
        >
          notes on apartment hunting as a pair without losing your mind
        </h1>

        <div
          className="font-mono text-xs text-zinc-400 pb-5 mb-7 border-b border-zinc-100 flex items-center justify-between"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: "11px",
            color: "#a1a1aa",
            borderBottom: "1px solid #f4f4f5",
          }}
        >
          <span>last edited 18 minutes ago by sam</span>
          <span>shared pair workspace</span>
        </div>

        {/* Document Body: stream-of-consciousness, unpolished, conversational note */}
        <div
          className="space-y-5 text-zinc-800 leading-relaxed font-normal"
          style={{
            fontSize: "16.5px",
            lineHeight: 1.78,
            color: "#27272a",
          }}
        >
          <p>
            it always starts the exact same way. you find a spot on StreetEasy at 11:42 PM on a Tuesday. it has windows that actually get sunlight, rent that isn&apos;t totally offensive, and laundry in the building. you immediately copy the link and paste it into iMessage.
          </p>

          <p>
            your roommate is out or asleep, so they heart the message four hours later. by the time you both get a five-minute break during work the next afternoon, forty other applicants have already messaged the listing agent, the open house slot is fully booked, and the link is buried under fifteen TikToks and a debate about whether Bed-Stuy is too far from the train.
          </p>

          <p>
            searching for an apartment as a pair is fundamentally broken because every rental tool assumes you are one person living alone. in reality, you have three different messaging threads, a Google Sheet nobody updates after day two, and a screenshot graveyard of floor plans with no measurements. you lose two critical hours every single time just coordinating who is going to email the broker, how to summarize both your salaries, and whether to mention that one of you has a cat.
          </p>

          <p>
            meanwhile, the brokers don&apos;t wait. if you don&apos;t reply within twenty minutes with proof you can actually pay rent, they move to the next person in line.
          </p>

          <p className="pt-2">
            so we started building Homeboard. not another portal with 50,000 stale listings, just a shared workspace for pairs with three simple things to close the gap before someone else takes the lease:
          </p>

          {/* Core Feature 1 */}
          <div
            className="pl-4 border-l-2 border-zinc-200 my-5 space-y-1.5"
            style={{ borderLeft: "2px solid #e4e4e7", paddingLeft: "1rem" }}
          >
            <p className="font-medium text-zinc-900" style={{ fontWeight: 500, color: "#18181b" }}>
              1. AI broker pitch generator
            </p>
            <p className="text-zinc-700" style={{ color: "#3f3f46" }}>
              brokers ignore generic &ldquo;is this still available?&rdquo; messages, but they also don&apos;t have time to read your life story. the second you both star a listing, Homeboard drafts an agent-ready intro packet with your combined income multiple, credit tiers, and move-in timeline cleanly formatted. you can{" "}
              <button
                type="button"
                onClick={() => setShowSamplePitch((prev) => !prev)}
                className="text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer font-serif bg-transparent border-0 p-0 inline"
                style={{ color: "#2563eb", textDecoration: "underline", textUnderlineOffset: "3px" }}
              >
                {showSamplePitch ? "hide sample pitch" : "see a sample broker pitch"}
              </button>{" "}
              or send it in one tap before the next applicant even opens their email app.
            </p>

            {showSamplePitch && (
              <div
                className="my-3 p-3.5 bg-zinc-50 border border-zinc-200/80 rounded font-mono text-xs text-zinc-700 leading-normal"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: "12px",
                  backgroundColor: "#fafafa",
                  borderColor: "#e4e4e7",
                  borderRadius: "4px",
                }}
              >
                <div className="text-zinc-400 text-[11px] mb-1 font-semibold uppercase tracking-wider">
                  // generated agent intro (sent in 1.4s)
                </div>
                <p>
                  <strong className="text-zinc-900">Subject:</strong> Rental Inquiry · 2 Applicants (Combined 46x Rent, 755+ Credit)
                </p>
                <p className="mt-1 text-zinc-600">
                  &ldquo;Hi Marcus — my roommate and I saw the 2BR on Bergen St and would love to view it today. Our combined gross income is $195k (documented with W-2s ready), credit scores 755+, target move-in Nov 1. Non-smokers, no pets. We have our complete application packet pre-assembled and can place a holding deposit on site.&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Core Feature 2 */}
          <div
            className="pl-4 border-l-2 border-zinc-200 my-5 space-y-1.5"
            style={{ borderLeft: "2px solid #e4e4e7", paddingLeft: "1rem" }}
          >
            <p className="font-medium text-zinc-900" style={{ fontWeight: 500, color: "#18181b" }}>
              2. Shared document locker checklist
            </p>
            <p className="text-zinc-700" style={{ color: "#3f3f46" }}>
              when the broker says &ldquo;first complete application with docs by 5 PM gets first review,&rdquo; you shouldn&apos;t be frantically texting each other asking for 2024 W-2s, paystubs, and guarantor letters from a crowded train. Homeboard keeps both your application assets verified, encrypted, and compiled into a single checklist so neither of you is scrambling at midnight.
            </p>
          </div>

          {/* Core Feature 3 */}
          <div
            className="pl-4 border-l-2 border-zinc-200 my-5 space-y-1.5"
            style={{ borderLeft: "2px solid #e4e4e7", paddingLeft: "1rem" }}
          >
            <p className="font-medium text-zinc-900" style={{ fontWeight: 500, color: "#18181b" }}>
              3. 50/50 Apple Pay deposit splits
            </p>
            <p className="text-zinc-700" style={{ color: "#3f3f46" }}>
              the single worst moment of apartment hunting: &ldquo;wire the $1,000 good-faith deposit right now or we show it to the next group.&rdquo; one person always ends up fronting thousands on their personal debit card while praying the other person&apos;s Venmo doesn&apos;t get flagged for daily transfer caps. Homeboard splits the holding fee 50/50 with instant Apple Pay authorization so nobody is floating rent on faith.
            </p>
          </div>

          {/* Action Trigger / Early Access Callout */}
          <p className="pt-2">
            we are letting in roommate pairs in rolling batches across Brooklyn and Manhattan right now. if you and your roommate are planning a move in the next 60 days, you can{" "}
            <button
              type="button"
              onClick={() => setShowEarlyAccess((prev) => !prev)}
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer font-serif bg-transparent border-0 p-0 inline"
              style={{ color: "#2563eb", textDecoration: "underline", textUnderlineOffset: "3px" }}
            >
              request early access here
            </button>{" "}
            before our next cohort closes.
          </p>

          {/* Inline Early Access Input Form */}
          {showEarlyAccess && (
            <div
              className="my-5 p-4 sm:p-5 bg-zinc-50 border border-zinc-200 rounded text-sm font-mono"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                backgroundColor: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: "4px",
              }}
            >
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                <span>// early access waitlist (fall 2026 cohort)</span>
                <button
                  type="button"
                  onClick={() => setShowEarlyAccess(false)}
                  className="text-zinc-400 hover:text-zinc-700 cursor-pointer font-mono px-1"
                  aria-label="Close early access form"
                >
                  ✕
                </button>
              </div>

              {isSubmitted ? (
                <div className="text-emerald-700 font-sans text-sm py-1">
                  ✓ You&apos;re on the list. We&apos;ll email you when your pair is cleared.
                </div>
              ) : (
                <form onSubmit={handleEarlyAccessSubmit} className="flex flex-col sm:flex-row gap-2 mt-2">
                  <input
                    type="email"
                    required
                    placeholder="enter your email..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-zinc-300 rounded text-xs text-zinc-900 font-mono focus:outline-none focus:border-zinc-500"
                    style={{
                      border: "1px solid #d4d4d8",
                      borderRadius: "3px",
                      fontSize: "12px",
                      padding: "8px 12px",
                      color: "#18181b",
                    }}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-zinc-900 text-white rounded text-xs hover:bg-zinc-800 transition-colors font-mono cursor-pointer select-none"
                    style={{
                      backgroundColor: "#18181b",
                      color: "#ffffff",
                      borderRadius: "3px",
                      fontSize: "12px",
                      padding: "8px 14px",
                      fontWeight: 500,
                    }}
                  >
                    request access →
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="text-zinc-500 text-sm pt-4 italic" style={{ color: "#71717a", fontSize: "14.5px" }}>
            typed quickly between apartment viewings. updates added as we ship.
          </p>
        </div>

        {/* Minimal Footer with Interactive Privacy Feature */}
        <footer
          className="mt-14 sm:mt-20 pt-6 border-t border-zinc-100 flex items-center justify-between text-xs font-mono text-zinc-400 relative select-none"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: "12px",
            borderTop: "1px solid #f4f4f5",
            marginTop: "3.5rem",
            paddingTop: "1.5rem",
            color: "#a1a1aa",
          }}
        >
          <span>Homeboard</span>

          {/* Interactive Privacy Policy Trigger & Floating Comment Bubble */}
          <div className="relative inline-block">
            {/* Document-style Floating Comment Bubble Card */}
            {isPrivacyOpen && (
              <div
                role="dialog"
                aria-label="Data Privacy Details"
                className="absolute bottom-full right-0 mb-3 bg-white border border-zinc-200 rounded-lg shadow-xl p-4 sm:p-5 text-left z-30"
                style={{
                  width: "min(22rem, calc(100vw - 3rem))",
                  maxWidth: "calc(100vw - 3rem)",
                  backgroundColor: "#ffffff",
                  borderColor: "#e4e4e7",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
                  borderRadius: "8px",
                  padding: "16px",
                  zIndex: 40,
                }}
              >
                {/* Comment Bubble Header */}
                <div
                  className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-100"
                  style={{ borderBottom: "1px solid #f4f4f5", paddingBottom: "8px", marginBottom: "12px" }}
                >
                  <div className="flex items-center gap-1.5" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-500 inline-block"
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981",
                        display: "inline-block",
                      }}
                    />
                    <span
                      className="text-[11px] font-mono tracking-tight text-zinc-500 uppercase font-semibold"
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: "11px",
                        color: "#71717a",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                      }}
                    >
                      Privacy Note · Read-only
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPrivacyOpen(false)}
                    className="text-zinc-400 hover:text-zinc-700 text-sm font-mono px-1 rounded transition-colors cursor-pointer bg-transparent border-0"
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: "14px",
                      color: "#a1a1aa",
                      cursor: "pointer",
                      padding: "0 4px",
                    }}
                    aria-label="Close privacy note"
                  >
                    ✕
                  </button>
                </div>

                {/* 3 Quick Data Privacy Bullet Points */}
                <ul
                  className="space-y-2.5 text-xs text-zinc-600 font-sans leading-relaxed m-0 p-0 list-none"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "#52525b",
                    margin: 0,
                    padding: 0,
                  }}
                >
                  <li className="flex items-start gap-2" style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                    <span className="text-zinc-400 font-mono mt-0.5" style={{ color: "#a1a1aa", userSelect: "none" }}>•</span>
                    <span>
                      <strong className="text-zinc-900 font-medium" style={{ color: "#18181b", fontWeight: 600 }}>No selling data:</strong> We never sell your rental preferences, contact info, or search history to brokerages, ad networks, or data brokers.
                    </span>
                  </li>

                  <li className="flex items-start gap-2" style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                    <span className="text-zinc-400 font-mono mt-0.5" style={{ color: "#a1a1aa", userSelect: "none" }}>•</span>
                    <span>
                      <strong className="text-zinc-900 font-medium" style={{ color: "#18181b", fontWeight: 600 }}>Encrypted doc vault:</strong> W-2s, paystubs, and photo IDs are encrypted at rest with AES-256 and only decrypted when you explicitly authorize submission to a verified landlord.
                    </span>
                  </li>

                  <li className="flex items-start gap-2" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className="text-zinc-400 font-mono mt-0.5" style={{ color: "#a1a1aa", userSelect: "none" }}>•</span>
                    <span>
                      <strong className="text-zinc-900 font-medium" style={{ color: "#18181b", fontWeight: 600 }}>Apple Pay token isolation:</strong> Deposit transactions use isolated Apple Pay payment tokens—Homeboard never sees, stores, or handles raw banking or card numbers.
                    </span>
                  </li>
                </ul>

                {/* Speech Bubble Pointer Caret anchored right above link */}
                <div
                  className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-b border-r border-zinc-200 transform rotate-45"
                  style={{
                    position: "absolute",
                    bottom: "-6px",
                    right: "22px",
                    width: "10px",
                    height: "10px",
                    backgroundColor: "#ffffff",
                    borderBottom: "1px solid #e4e4e7",
                    borderRight: "1px solid #e4e4e7",
                    transform: "rotate(45deg)",
                  }}
                  aria-hidden="true"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsPrivacyOpen((prev) => !prev)}
              aria-expanded={isPrivacyOpen}
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer transition-colors bg-transparent border-0 p-0 font-mono"
              style={{
                color: "#2563eb",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                cursor: "pointer",
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              Privacy Policy
            </button>
          </div>
        </footer>
      </article>
    </main>
  );
}
