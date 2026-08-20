import type { Metadata } from "next";
import Link from "next/link";

import { InfoFooter, InfoHeader } from "./info-shell";
import styles from "./info.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested Homeboard page could not be found.",
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={`${styles.main} ${styles.notFound}`}>
        <span className={styles.kicker}>404 · Wrong address</span>
        <h1>This place isn’t on the board.</h1>
        <p className={styles.lead}>
          The page may have moved, the link may be incomplete, or the listing may no longer exist.
        </p>
        <Link className={styles.primaryLink} href="/">
          Return to Homeboard <span aria-hidden="true">→</span>
        </Link>
      </div>
      <InfoFooter />
    </main>
  );
}
