import type { Metadata } from "next";

import { InfoFooter, InfoHeader, SupportEmail } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "How beta testers can contact Homeboard.",
};

export default function ContactPage() {
  const hasSupportEmail = Boolean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim());
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>Contact</span>
        <h1>Get help with the Homeboard beta.</h1>
        <p className={styles.lead}>Use the in-app bug-report tool for product problems. It returns a tracking ID and includes an optional privacy-filtered diagnostic trace.</p>
        <div className={styles.sections}>
          <article><h2>Email</h2><p>{hasSupportEmail ? <>Configured beta inbox: <SupportEmail /></> : "A public support inbox is not configured. Use the in-app report or TestFlight feedback."}</p></article>
          <article><h2>TestFlight</h2><p>TestFlight testers can also send feedback, screenshots, and crash details from the TestFlight app. Include the tracking ID from Homeboard when one is available.</p></article>
          <article><h2>Privacy and account deletion</h2><p>Delete an account from Homeboard settings. If deletion cannot complete, submit an in-app report and identify it as an account or privacy problem.</p></article>
        </div>
        <p className={styles.notice}>Homeboard only displays an email address when the deployment has a monitored support inbox configured.</p>
      </div>
      <InfoFooter />
    </main>
  );
}
