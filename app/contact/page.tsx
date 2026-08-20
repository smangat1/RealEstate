import type { Metadata } from "next";

import { InfoFooter, InfoHeader, SupportEmail } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to contact Homeboard before public beta.",
};

export default function ContactPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>Contact</span>
        <h1>A real support channel is coming with the beta.</h1>
        <p className={styles.lead}>Homeboard does not list an official public support inbox yet. This page will be updated with verified contact details before beta invitations open.</p>
        <div className={styles.sections}>
          <article><h2>Beta support</h2><p>Account help, listing-import problems, bug reports, and privacy requests will each have a clear contact path.<SupportEmail /></p></article>
          <article><h2>No fake inbox</h2><p>Homeboard will not publish an address that is not configured, monitored, and able to receive replies.</p></article>
        </div>
        <p className={styles.notice}>For now, return to the Homeboard overview. Official contact details will appear here before launch.</p>
      </div>
      <InfoFooter />
    </main>
  );
}
