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
        }
        body {
          margin: 0;
          padding: 0;
          background: #f0f2f5 !important;
          color: #1f2328 !important;
          -webkit-font-smoothing: antialiased;
        }
        body::before {
          display: none !important;
        }
      `}</style>

      <div className="min-h-screen w-full bg-[#f0f2f5] flex flex-col font-sans">
        {/* Document Editor Top Navigation Bar */}
        <header className="w-full bg-white border-b border-[#e5e7eb] sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {/* Main Document Header */}
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Document Icon */}
              <div
                className="w-7 h-8 bg-blue-50/80 border border-blue-200 rounded-[3px] flex flex-col justify-center items-center gap-1 shadow-xs flex-shrink-0"
                aria-hidden="true"
              >
                <div className="w-3.5 h-[1.5px] bg-blue-500 rounded-full" />
                <div className="w-3.5 h-[1.5px] bg-blue-500 rounded-full" />
                <div className="w-2 h-[1.5px] bg-blue-400 rounded-full self-start ml-1.5" />
              </div>

              {/* Title & Metadata */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#111827] text-sm tracking-tight">
                    Homeboard
                  </span>
                  <span className="bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb] text-[10px] font-mono px-1.5 py-0.5 rounded font-medium">
                    read-only
                  </span>
                </div>
                <div className="text-[11px] text-[#9ca3af] font-mono flex items-center gap-1.5">
                  <span className="truncate max-w-[130px] sm:max-w-none">apartment_search_notes.doc</span>
                  <span>·</span>
                  <span>Saved to cloud</span>
                </div>
              </div>
            </div>

            {/* Right Status & Presence */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center -space-x-1.5">
                <span
                  title="Sam (Editor)"
                  className="w-6 h-6 rounded-full bg-amber-500 text-white font-medium text-[10px] flex items-center justify-center border-2 border-white shadow-xs select-none"
                >
                  S
                </span>
                <span
                  title="Jordan (Editor)"
                  className="w-6 h-6 rounded-full bg-indigo-500 text-white font-medium text-[10px] flex items-center justify-center border-2 border-white shadow-xs select-none"
                >
                  J
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#6b7280] hidden sm:inline select-none">
                2 in document
              </span>
            </div>
          </div>

          {/* Sub-toolbar: Viewing Mode / Document Ruler Ribbon */}
          <div className="w-full bg-[#f9fafb] border-t border-[#f3f4f6] px-4 py-1 text-[11px] text-[#6b7280] font-mono flex items-center justify-between select-none">
            <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[#374151] font-medium">
                  <svg className="w-3.5 h-3.5 text-[#4b5563]" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Viewing mode
                </span>
                <span className="hidden sm:inline text-[#d1d5db]">|</span>
                <span className="hidden sm:inline text-[#9ca3af]">100%</span>
                <span className="hidden sm:inline text-[#d1d5db]">|</span>
                <span className="hidden sm:inline text-[#9ca3af]">Page 1 of 1</span>
              </div>
              <div className="text-[11px] text-[#9ca3af] font-mono">
                Homeboard · read-only
              </div>
            </div>
          </div>
        </header>

        {/* Document Canvas Workspace */}
        <main className="flex-1 w-full flex justify-center py-0 sm:py-8 md:py-10 px-0 sm:px-4">
          {/* Centered White Document Sheet */}
          <article className="w-full max-w-2xl bg-white sm:border sm:border-[#e5e7eb] sm:shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_28px_rgba(0,0,0,0.04)] sm:rounded-[2px] min-h-screen sm:min-h-0 p-6 sm:p-12 md:p-14 flex flex-col justify-between relative">
            <div>
              {/* Document Header Line inside paper */}
              <div className="font-mono text-[11px] sm:text-xs text-[#9ca3af] tracking-tight mb-8 select-none flex items-center justify-between border-b border-[#f3f4f6] pb-2.5">
                <span>Homeboard · read-only</span>
                <span>last edited 14m ago · shared draft</span>
              </div>

              {/* Document Title */}
              <h1 className="font-serif text-2xl sm:text-[28px] text-[#111827] font-normal tracking-tight leading-snug mb-5">
                finding an apartment as a pair without losing your mind
              </h1>

              {/* Document Body: Candid, stream-of-consciousness, raw note */}
              <div className="font-serif text-[16px] sm:text-[17px] text-[#1f2328] leading-[1.72] space-y-4">
                <p>
                  it&apos;s always the exact same story.
                </p>

                <p>
                  you find an apartment on StreetEasy at midnight. you drop the link into iMessage. your roommate hearts it four hours later while you&apos;re both at work. by lunch, forty other groups have emailed the listing agent, the open house slot is capped, and the link is buried under fifteen reels and a debate about commute times.
                </p>

                <p>
                  apartment hunting as a pair is broken because rental apps treat you like a single person living alone. in reality, you have three group chats, a spreadsheet nobody updates, and zero coordination when a good unit drops. by the time you agree on who is emailing the broker, the apartment is gone.
                </p>

                <p className="pt-2 text-[#4b5563]">
                  we built Homeboard around three things to fix this:
                </p>

                <ol className="list-decimal list-outside pl-5 space-y-2.5 pt-1 text-[#1f2328]">
                  <li>
                    <strong className="font-medium text-[#111827]">AI broker pitch generator</strong> — drafts tailored agent inquiries in seconds with your combined income multiple, credit tiers, and move-in timeline before the listing disappears.
                  </li>
                  <li>
                    <strong className="font-medium text-[#111827]">Shared document locker checklist</strong> — keeps W-2s, paystubs, IDs, and guarantor letters verified in one encrypted spot so you aren&apos;t scrambling when an agent asks for docs by 5 PM.
                  </li>
                  <li>
                    <strong className="font-medium text-[#111827]">50/50 Apple Pay deposit splits</strong> — instant, equal splits for good-faith holding deposits so neither roommate has to front $4,000 on a personal debit card.
                  </li>
                </ol>

                <p className="pt-4">
                  we are onboarding NYC roommate pairs in rolling batches.{" "}
                  <a
                    href="mailto:early@homeboard.app?subject=Homeboard%20Early%20Access%20Request&body=Hi%20Homeboard%20team%2C%0A%0AMy%20roommate%20and%20I%20are%20looking%20for%20an%20apartment%20in%20NYC%20and%20would%20love%20early%20access.%0A%0ANames%3A%0ATarget%20move-in%20date%3A%0ABoroughs%2Fneighborhoods%3A"
                    className="text-[#1a73e8] hover:text-[#1557b0] underline underline-offset-2 cursor-pointer"
                  >
                    request early access
                  </a>{" "}
                  to join the private beta.
                </p>

                <p className="text-xs font-mono text-[#9ca3af] pt-4 italic">
                  typed quickly between open houses. updates added as we ship.
                </p>
              </div>
            </div>

            {/* Document Footer with Universal Hyperlink & Floating Comment Bubble */}
            <footer className="mt-14 sm:mt-16 pt-5 border-t border-[#f3f4f6] flex items-center justify-between text-xs font-mono text-[#9ca3af] relative select-none">
              <span>Homeboard</span>

              {/* Universal Blue Hyperlink for Privacy Policy */}
              <div className="relative">
                {isPrivacyOpen && (
                  <div
                    role="dialog"
                    aria-label="Data Privacy Details"
                    className="absolute bottom-full right-0 mb-2.5 w-[calc(100vw-32px)] sm:w-80 max-w-sm bg-white border border-[#d0d7de] rounded-md shadow-[0_8px_24px_rgba(140,149,159,0.2)] p-4 text-left z-30 font-sans"
                  >
                    {/* Comment Bubble Header */}
                    <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#f3f4f6]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#111827]">
                          Homeboard Privacy
                        </span>
                        <span className="text-[11px] font-mono text-[#6b7280]">
                          · read-only note
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPrivacyOpen(false)}
                        className="text-[#9ca3af] hover:text-[#111827] text-sm px-1 cursor-pointer bg-transparent border-0"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* 3 Clean Privacy Points */}
                    <div className="space-y-2 text-xs text-[#4b5563] leading-relaxed">
                      <p>
                        <strong className="text-[#111827]">1. No selling data:</strong> We never sell search history, preferences, or contact info to brokerages or data brokers.
                      </p>
                      <p>
                        <strong className="text-[#111827]">2. Encrypted doc vault:</strong> W-2s, paystubs, and IDs are AES-256 encrypted at rest and only decrypted when you submit an application.
                      </p>
                      <p>
                        <strong className="text-[#111827]">3. Apple Pay token isolation:</strong> Deposit splits use device-level Apple Pay payment tokens—we never store or see bank numbers.
                      </p>
                    </div>

                    {/* Speech Bubble Triangle Caret */}
                    <div
                      className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-b border-r border-[#d0d7de] transform rotate-45"
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
                  className="text-[#1a73e8] hover:text-[#1557b0] underline underline-offset-2 cursor-pointer font-mono text-xs"
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
