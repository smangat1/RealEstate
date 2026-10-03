"use client";

import React, { useState, useEffect } from "react";

export default function HomeboardPage() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [earlyAccessRequested, setEarlyAccessRequested] = useState(false);

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
          background: #f4f4f5 !important;
        }
        body {
          margin: 0;
          padding: 0;
          background: #f4f4f5 !important;
          color: #1f2328 !important;
          -webkit-font-smoothing: antialiased;
        }
        body::before {
          display: none !important;
        }
      `}</style>

      {/* Main Canvas: Light-gray desk background on desktop, seamless edge-to-edge on mobile */}
      <main className="min-h-screen w-full bg-[#f4f4f5] flex justify-center sm:py-12 md:py-16 px-0 sm:px-4">
        {/* Document Sheet */}
        <article className="w-full max-w-2xl bg-white sm:border sm:border-[#e2e4e8] sm:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_20px_rgba(0,0,0,0.03)] sm:rounded-sm min-h-screen sm:min-h-0 p-6 sm:p-12 md:p-16 flex flex-col justify-between relative">
          <div>
            {/* Top Document Status */}
            <div className="font-mono text-[11px] sm:text-xs text-[#8c959f] tracking-tight mb-8 sm:mb-10 select-none flex items-center justify-between border-b border-[#f0f2f5] pb-3">
              <span>Homeboard · read-only</span>
              <span className="text-[#afb8c1]">shared note</span>
            </div>

            {/* Document Title */}
            <h1 className="font-serif text-2xl sm:text-3xl text-[#1f2328] font-normal tracking-tight leading-snug mb-6">
              finding a 2BR with someone without losing your mind
            </h1>

            {/* Document Body: Short, candid, unpolished note */}
            <div className="font-serif text-[16px] sm:text-[17px] text-[#24292f] leading-[1.7] space-y-4">
              <p>
                it&apos;s always the same story.
              </p>

              <p>
                you find a listing on StreetEasy at midnight. you drop the link into iMessage. your roommate hearts it four hours later while you&apos;re both at work. by lunch, forty other groups have emailed the broker, the open house slot is capped, and the link is buried under fifteen reels and a debate about commute times.
              </p>

              <p>
                apartment hunting as a pair is broken because rental apps treat you like a single person. in reality, you have three group chats, a spreadsheet nobody updates, and zero coordination when a good unit drops. by the time you agree on who is going to email the broker, the apartment is gone.
              </p>

              <p className="pt-2 text-[#57606a]">
                we built Homeboard around three things to fix this:
              </p>

              <ol className="list-decimal list-outside pl-5 space-y-3 pt-1 text-[#24292f]">
                <li>
                  <strong className="font-medium text-[#1f2328]">AI broker pitch generator</strong> — drafts tailored intro inquiries in seconds with your combined income multiple, credit tiers, and target move-in date before the listing disappears.
                </li>
                <li>
                  <strong className="font-medium text-[#1f2328]">Shared document locker checklist</strong> — keeps W-2s, paystubs, IDs, and guarantor letters verified in one encrypted vault so you aren&apos;t scrambling when an agent asks for a complete packet by 5 PM.
                </li>
                <li>
                  <strong className="font-medium text-[#1f2328]">50/50 Apple Pay deposit splits</strong> — instant, equal splits for good-faith holding deposits so neither roommate has to front $4,000 on a personal debit card.
                </li>
              </ol>

              <p className="pt-4">
                we&apos;re onboarding NYC roommate pairs in rolling batches.{" "}
                <button
                  type="button"
                  onClick={() => setEarlyAccessRequested(true)}
                  className="text-[#1a73e8] hover:text-[#1557b0] underline underline-offset-2 cursor-pointer font-serif bg-transparent border-0 p-0 inline"
                >
                  request early access
                </button>{" "}
                to join the private beta.
              </p>

              {earlyAccessRequested && (
                <p className="text-xs font-mono text-[#0969da] bg-[#ddf4ff] border border-[#54aeff]/30 rounded p-2.5 mt-2">
                  ✓ request received. we&apos;ll reach out to your pair for the next batch.
                </p>
              )}
            </div>
          </div>

          {/* Minimal Document Footer */}
          <footer className="mt-14 sm:mt-16 pt-5 border-t border-[#f0f2f5] flex items-center justify-between text-xs font-mono text-[#8c959f] relative select-none">
            <span>Homeboard</span>

            {/* Privacy Policy Trigger & Anchored Comment Bubble */}
            <div className="relative">
              {isPrivacyOpen && (
                <div
                  role="dialog"
                  aria-label="Data Privacy Details"
                  className="absolute bottom-full right-0 mb-2.5 w-[calc(100vw-3rem)] sm:w-80 max-w-sm bg-white border border-[#d0d7de] rounded-md shadow-[0_8px_24px_rgba(140,149,159,0.2)] p-4 text-left z-30 font-sans"
                >
                  {/* Comment Bubble Header */}
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#f0f2f5]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#24292f]">Homeboard Privacy</span>
                      <span className="text-[11px] font-mono text-[#6e7781]">· note</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPrivacyOpen(false)}
                      className="text-[#8c959f] hover:text-[#24292f] text-sm px-1 cursor-pointer bg-transparent border-0"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 3 Privacy Bullets */}
                  <div className="space-y-2 text-xs text-[#57606a] leading-relaxed">
                    <p>
                      <strong className="text-[#1f2328]">1. No selling data:</strong> We never sell search history, preferences, or contact info to brokerages or data brokers.
                    </p>
                    <p>
                      <strong className="text-[#1f2328]">2. Encrypted doc vault:</strong> W-2s, paystubs, and IDs are AES-256 encrypted at rest and only decrypted upon your application submission.
                    </p>
                    <p>
                      <strong className="text-[#1f2328]">3. Apple Pay token isolation:</strong> Deposit splits use device-level Apple Pay payment tokens—we never store or see bank account numbers.
                    </p>
                  </div>

                  {/* Pointer Caret */}
                  <div
                    className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-b border-r border-[#d0d7de] transform rotate-45"
                    aria-hidden="true"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsPrivacyOpen((prev) => !prev)}
                aria-expanded={isPrivacyOpen}
                className="text-[#1a73e8] hover:text-[#1557b0] underline underline-offset-2 cursor-pointer font-mono bg-transparent border-0 p-0 text-xs"
              >
                Privacy Policy
              </button>
            </div>
          </footer>
        </article>
      </main>
    </>
  );
}
