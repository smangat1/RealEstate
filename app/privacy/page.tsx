import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Homeboard's pre-beta privacy notice and policy commitments.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>Pre-beta privacy notice</span>
        <h1>Privacy should be understandable before you join.</h1>
        <p className={styles.lead}>Homeboard is not publicly accepting accounts through this website yet. A complete, plain-language privacy policy will be published before public beta access opens.</p>
        <div className={styles.sections}>
          <article><h2>This website</h2><p>The current marketing site does not contain an email signup or advertising tracker. Its hosting provider may still process ordinary request information needed to deliver and secure the page.</p></article>
          <article><h2>The beta app</h2><p>The final policy will describe how account details, shared boards, listing links and facts, commute destinations, preferences, and group activity are collected and used to provide Homeboard.</p></article>
          <article><h2>Service providers</h2><p>The final policy will identify the services that help operate authentication, syncing, hosting, maps, routing, and listing imports, along with what information each service receives.</p></article>
          <article><h2>Your control</h2><p>Before beta, Homeboard will document retention, account deletion, data removal, security, contact details, and how users can exercise applicable privacy rights.</p></article>
        </div>
        <p className={styles.notice}>This page is an honest pre-beta notice, not Homeboard’s final legal privacy policy.</p>
      </div>
      <InfoFooter />
    </main>
  );
}
