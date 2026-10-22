import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact Homeboard support and get help with reports or account deletion.",
};

const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@joinhomeboard.com";

export default function SupportPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>support · contact</span>
        <h1>How can we help?</h1>
        <p className={styles.lead}>
          Email Homeboard support for account help, safety concerns, or a
          problem with the app.
        </p>

        <div className={styles.sections}>
          <article>
            <h2>Contact support</h2>
            <p>
              Email <a className={styles.emailLink} href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              Include what you were trying to do, what happened, your app
              version, and any tracking ID shown by the app. Do not send
              passwords, Apple authorization codes, payment details, or other
              secrets.
            </p>
          </article>

          <article>
            <h2>Report or block a message</h2>
            <p>
              In a board conversation, long-press the message and choose
              <strong> Report message</strong>. Pick a reason and add details if
              helpful. You can also choose <strong>Block</strong> so messages
              from that person no longer appear for you. We review reports
              within 24 hours and remove content that breaks the rules.
            </p>
          </article>

          <article>
            <h2>Delete your account</h2>
            <p>
              Open Homeboard Settings and choose <strong>Delete account and
              data</strong>. Confirm the deletion in the app. If you use Sign in
              with Apple, Homeboard will also ask you to confirm with Apple so
              it can disconnect the account.
            </p>
          </article>
        </div>
      </div>
      <InfoFooter />
    </main>
  );
}

