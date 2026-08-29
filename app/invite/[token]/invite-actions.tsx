"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./invite.module.css";

export function InviteActions({
  nativeURL,
  installURL,
  inviteURL,
}: {
  nativeURL: string;
  installURL: string | null;
  inviteURL: string;
}) {
  const fallbackTimer = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [openStatus, setOpenStatus] = useState<string | null>(null);

  useEffect(() => {
    function cancelFallbackWhenHidden() {
      if (document.visibilityState === "hidden" && fallbackTimer.current) {
        window.clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    }

    document.addEventListener("visibilitychange", cancelFallbackWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", cancelFallbackWhenHidden);
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    };
  }, []);

  function openOrInstall() {
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    setOpenStatus("Opening Homeboard…");
    window.location.assign(nativeURL);

    fallbackTimer.current = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (installURL) {
        window.location.assign(installURL);
      } else {
        setOpenStatus("Homeboard is not publicly installable yet. Keep this link and return after joining the beta.");
      }
      fallbackTimer.current = null;
    }, 1200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteURL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.actionBlock}>
      <button type="button" className={styles.primaryAction} onClick={openOrInstall}>
        <span>Open Homeboard</span>
        <span aria-hidden="true">↗</span>
      </button>

      <div className={styles.secondaryActions}>
        {installURL ? (
          <a href={installURL} target="_blank" rel="noreferrer">Install for iPhone</a>
        ) : (
          <Link href="/?install=1" target="_blank" rel="noreferrer">Beta install details</Link>
        )}
        <button type="button" onClick={() => void copyLink()}>
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </div>

      {openStatus ? <p className={styles.openStatus} role="status">{openStatus}</p> : null}
      <p className={styles.returnNote}>
        Installing first? Keep this page open, then return and tap <strong>Open Homeboard</strong>.
      </p>
    </div>
  );
}
