"use client";

import Image from "next/image";

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
            <p className={styles.installRoadmap}>
              <strong>Planned next</strong>
              Better routes, more rental sources, richer neighborhood context, and a plain-language privacy policy before beta.
            </p>
          </div>

          <figure className={styles.installScreenshot}>
            <figcaption>A look inside Homeboard</figcaption>
            <Image
              src="/images/homeboard-comparison-map-clean.png"
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
