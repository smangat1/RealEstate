import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Homeboard handles information during the beta.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>Beta privacy notice · Updated September 5, 2026</span>
        <h1>How Homeboard uses your information.</h1>
        <p className={styles.lead}>Homeboard uses account and rental-search information to run shared boards. It does not sell personal information or use it for targeted advertising.</p>
        <div className={styles.sections}>
          <article><h2>Information Homeboard stores</h2><p>This includes your account identity, shared-board membership, rental preferences, commute destinations, listing links and facts, uploaded listing photos, messages, comments, reactions, invitations, push-device records, device-pairing records, bug reports, and product diagnostics.</p></article>
          <article><h2>How it is used</h2><p>The information powers authentication, board syncing, listing capture, maps and commute comparisons, collaboration, notifications, troubleshooting, security, and product improvement. Members of a board can see the content shared with that board.</p></article>
          <article><h2>Services involved</h2><p>Homeboard relies on hosting and database providers, Apple services, mapping and routing services, error monitoring, and any listing-data provider enabled for the beta. Each service receives only the information needed for its role.</p></article>
          <article><h2>Your control</h2><p>You can sign out, leave eligible boards, remove content through available board controls, or delete your account in the app. Account deletion removes active application records and uploaded account images; infrastructure backups and security logs may follow their providers&apos; limited retention cycles.</p></article>
          <article><h2>Beta reports</h2><p>Bug reports can include app and device versions, the current screen, item counts, and a filtered diagnostic trace. Homeboard asks before sending a report and filters common credentials, email addresses, and listing URLs.</p></article>
        </div>
        <p className={styles.notice}>Questions or deletion problems can be submitted through the in-app bug-report tool, TestFlight feedback, or the contact route listed on this site.</p>
      </div>
      <InfoFooter />
    </main>
  );
}
