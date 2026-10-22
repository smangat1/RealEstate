import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Community Rules and Terms",
  description: "The plain-language rules for using Homeboard with a roommate group.",
};

const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@joinhomeboard.com";

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>community_rules · terms</span>
        <h1>Keep Homeboard useful and safe.</h1>
        <p className={styles.lead}>
          Homeboard is a shared housing search. Treat roommates and other
          members with respect, and use the app only for lawful housing-related
          activity.
        </p>

        <div className={styles.sections}>
          <article>
            <h2>Community rules</h2>
            <p>
              We do not tolerate objectionable content, including harassment,
              hate, explicit sexual content or solicitation, threats, spam,
              scams, or illegal content. Do not impersonate another person,
              misuse someone&apos;s personal information, or pressure a member to
              share money, credentials, or private documents.
            </p>
          </article>

          <article>
            <h2>What happens after a violation</h2>
            <p>
              Homeboard may remove content that breaks these rules and may
              remove an account that posts serious or repeated violations.
              Access may be limited while a report is reviewed.
            </p>
          </article>

          <article>
            <h2>Reports and blocks</h2>
            <p>
              Long-press a user message in the app to report it or block its
              author. Reports include a copy of the message at the time of the
              report. We aim to review reports within 24 hours. Blocking hides
              that person&apos;s user messages for you and does not notify them.
            </p>
          </article>

          <article>
            <h2>Your account</h2>
            <p>
              You are responsible for activity through your account. You may
              stop using Homeboard and delete your account from Settings. These
              terms may change as the service changes; the date below tells you
              when this version was updated.
            </p>
          </article>

          <article>
            <h2>Contact</h2>
            <p>
              Questions about these rules can be sent to{" "}
              <a className={styles.emailLink} href={`mailto:${supportEmail}`}>{supportEmail}</a>.
            </p>
          </article>
        </div>

        <p className={styles.notice}>Last updated: 22 October 2026</p>
      </div>
      <InfoFooter />
    </main>
  );
}
