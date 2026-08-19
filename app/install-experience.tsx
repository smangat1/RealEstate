"use client";

import Image from "next/image";
import { useRef } from "react";

import styles from "./marketing.module.css";

export function InstallExperience() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className={styles.mobileInstallButton}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span>Install Homeboard</span>
        <span aria-hidden="true">↗</span>
        <small>Private beta details</small>
      </button>

      <dialog
        className={styles.installDialog}
        ref={dialogRef}
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
            <h2 id="install-dialog-title">The install is coming next.</h2>
            <p>
              Homeboard is not in the App Store yet. When the beta opens, this button will take you to the official TestFlight install for iPhone and the paired Mac download.
            </p>
            <div className={styles.installSteps}>
              <article><b>01</b><p><strong>Install on iPhone</strong>Join the beta through Apple TestFlight.</p></article>
              <article><b>02</b><p><strong>Connect your Mac</strong>Pair the Safari companion with the same Homeboard account.</p></article>
              <article><b>03</b><p><strong>Share a listing</strong>Send places from rental sites straight into your shared board.</p></article>
            </div>
            <p className={styles.installStatus}>No download is available yet · Beta access coming soon</p>

            <figure className={styles.installScreenshot}>
              <figcaption>A look inside Homeboard</figcaption>
              <Image
                src="/images/homeboard-comparison-map.png"
                alt="Homeboard comparison map showing rental scores, a work destination, and matching commute routes"
                width={1179}
                height={2556}
                sizes="(max-width: 720px) 88vw, 520px"
              />
            </figure>
          </div>
        </div>
      </dialog>
    </>
  );
}
