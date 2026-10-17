import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "How beta testers can contact Homeboard.",
};

export default function ContactPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>contact_and_support · read-only</span>
        <h1>Get help with Homeboard.</h1>
        <p className={styles.lead}>
          Have a question, feedback, or need help with your shared board? Contact our team directly at{" "}
          <a className={styles.emailLink} href="mailto:support@joinhomeboard.com">
            support@joinhomeboard.com
          </a>
          .
        </p>
        <div className={styles.sections}>
          <article>
            <h2>Direct support</h2>
            <p>
              Email us anytime at{" "}
              <a className={styles.emailLink} href="mailto:support@joinhomeboard.com">
                support@joinhomeboard.com
              </a>
              . We respond to all beta inquiries within 24 hours.
            </p>
          </article>
          <article>
            <h2>In-app bug reports</h2>
            <p>
              Use the in-app bug report tool in Homeboard settings. It attaches an optional privacy-filtered diagnostic trace so we can resolve issues quickly.
            </p>
          </article>
          <article>
            <h2>TestFlight feedback</h2>
            <p>
              TestFlight testers can share screenshots, crash logs, and notes directly from the Apple TestFlight application.
            </p>
          </article>
          <article>
            <h2>Privacy and data requests</h2>
            <p>
              Manage or delete your data anytime in Homeboard settings. For export or deletion assistance, reach out to{" "}
              <a className={styles.emailLink} href="mailto:support@joinhomeboard.com">
                support@joinhomeboard.com
              </a>
              .
            </p>
          </article>
        </div>
        <p className={styles.notice}>
          Need help right now? Reach our support team directly at{" "}
          <a style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }} href="mailto:support@joinhomeboard.com">
            support@joinhomeboard.com
          </a>
          .
        </p>
      </div>
      <InfoFooter />
    </main>
  );
}
