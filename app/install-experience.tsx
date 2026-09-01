"use client";

import Image from "next/image";
import { useEffect } from "react";

import { ShareToMacButton } from "@/components/share-to-mac-button";
import styles from "./marketing.module.css";

const INSTALL_DIALOG_ID = "homeboard-install";

export function InstallTrigger({
  className,
  detail,
}: {
  className?: string;
  detail?: string;
}) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        const dialog = document.getElementById(INSTALL_DIALOG_ID) as HTMLDialogElement | null;
        if (dialog && !dialog.open) dialog.showModal();
      }}
    >
      <span>Install Homeboard</span>
      <span aria-hidden="true">↗</span>
      {detail ? <small>{detail}</small> : null}
    </button>
  );
}

export function InstallExperience() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("install") !== "1") return;
    const dialog = document.getElementById(INSTALL_DIALOG_ID) as HTMLDialogElement | null;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      className={styles.installDialog}
      id={INSTALL_DIALOG_ID}
      aria-labelledby="install-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className={styles.installDialogPanel}>
        <header>
          <span>Homeboard · Private beta</span>
          <form method="dialog">
            <button type="submit" aria-label="Close install information">×</button>
          </form>
        </header>

        <div className={styles.installDialogBody}>
          <div className={styles.installDialogCopy}>
            <h2 id="install-dialog-title">Start on iPhone. Add Safari on Mac.</h2>
            <p>
              Homeboard’s private beta uses the iPhone app for the shared board and a lightweight Mac companion for saving listings from Safari.
            </p>
            <div className={styles.installSteps}>
              <article><b>01</b><p><strong>Install on iPhone</strong>Join the beta through Apple TestFlight.</p></article>
              <article><b>02</b><p><strong>Send setup to your Mac</strong>Use AirDrop, Messages, or copy one link. You do not need to search an extension directory.</p></article>
              <article><b>03</b><p><strong>Scan one QR code</strong>Pair the Safari companion with the signed-in iPhone app.</p></article>
              <article><b>04</b><p><strong>Save from Safari</strong>Review a rental and send it straight into your shared board.</p></article>
            </div>
            <div className={styles.installActions}>
              <a href="/safari"><span>Set up Safari on Mac</span><span aria-hidden="true">→</span></a>
              <ShareToMacButton sharePath="/safari" />
            </div>
            <p className={styles.installStatus}>Private beta · Official install links appear here when active</p>
            <p className={styles.installRoadmap}>
              <strong>Why a Mac companion?</strong>
              Apple requires the containing Mac app to run once and the user to enable its Safari extension. Homeboard guides both steps directly.
            </p>
          </div>

          <figure className={styles.installScreenshot}>
            <figcaption>A look inside Homeboard</figcaption>
            <Image
              src="/images/homeboard-comparison-map-clean.webp"
              alt="Homeboard comparison map showing rental scores, a work destination, and matching commute routes"
              width={1179}
              height={2360}
              sizes="(max-width: 720px) 88vw, 360px"
            />
          </figure>
        </div>
      </div>
    </dialog>
  );
}
