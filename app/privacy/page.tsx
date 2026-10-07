import type { Metadata } from "next";

import { InfoFooter, InfoHeader } from "../info-shell";
import styles from "../info.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Homeboard handles and protects your data.",
};

const sectionBodyStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <InfoHeader />
      <div className={styles.main}>
        <span className={styles.kicker}>Privacy policy</span>
        <h1>How Homeboard handles your data.</h1>
        <p className={styles.lead}>
          Homeboard is an iOS roommate house-hunting app. Groups make boards,
          shortlist listings, score commutes, and chat. We collect only what is
          required to run the app, keep sensitive details on your device, and
          never sell your information.
        </p>

        <div className={styles.sections}>
          <article>
            <h2>What we collect</h2>
            <div style={sectionBodyStyle}>
              <p>
                <strong>Account data:</strong> Name and email address only,
                stored on our servers.
              </p>
              <p>
                <strong>User content:</strong> Boards, shortlisted listings,
                group chat messages, housing preferences (including saved
                commute destinations), and replies, stored on our servers.
              </p>
              <p>
                <strong>App function:</strong> Push notification device tokens,
                stored on our servers only if you choose to enable
                notifications.
              </p>
            </div>
          </article>

          <article>
            <h2>What we never collect</h2>
            <div style={sectionBodyStyle}>
              <p>We never sell your data.</p>
              <p>No ads and no ad tracking.</p>
              <p>No analytics SDKs.</p>
              <p>No financial data collected.</p>
              <p>No retention dark patterns.</p>
            </div>
          </article>

          <article>
            <h2>Where your data lives</h2>
            <div style={sectionBodyStyle}>
              <p>
                Processing is done on your device where possible. Sensitive
                details stay on-device by design.
              </p>
              <p>
                Shared group content (boards, shortlisted listings, messages,
                and housing preferences) syncs to our servers so your roommate
                group stays up to date.
              </p>
            </div>
          </article>

          <article>
            <h2>Third parties</h2>
            <div style={sectionBodyStyle}>
              <p>
                We use trusted third parties to process data strictly for app
                operations:
              </p>
              <p>
                <strong>Supabase:</strong> Database infrastructure to store
                account and board records.
              </p>
              <p>
                <strong>Vercel:</strong> Application hosting and API routing.
              </p>
              <p>
                <strong>Apple MapKit:</strong> Listing and commute addresses are
                sent to Apple to compute routes and travel times.
              </p>
              <p>
                <strong>Apple Push Notification service:</strong> Delivers push
                notifications to your device when enabled.
              </p>
            </div>
          </article>

          <article>
            <h2>Notifications</h2>
            <div style={sectionBodyStyle}>
              <p>
                Push notification device tokens are stored only if you enable
                notifications.
              </p>
              <p>
                Notifications are used strictly to keep you updated on your
                group boards and messages. You can turn notifications off at
                any time in iOS Settings.
              </p>
            </div>
          </article>

          <article>
            <h2>Deleting your data</h2>
            <div style={sectionBodyStyle}>
              <p>
                You can delete your account at any time directly in app
                settings.
              </p>
              <p>
                When you delete your account, your data and your boards are
                deleted with it.
              </p>
              <p>
                A recently-deleted recovery window exists so accidental
                deletions can be recovered before permanent removal.
              </p>
            </div>
          </article>

          <article>
            <h2>Contact</h2>
            <div style={sectionBodyStyle}>
              <p>
                For questions about this privacy policy or your personal data,
                contact us:
              </p>
              <a className={styles.emailLink} href="mailto:SUPPORT_EMAIL">
                SUPPORT_EMAIL
              </a>
            </div>
          </article>
        </div>

        <p className={styles.notice}>
          Homeboard is built for roommate groups. We collect only what is
          required to run your search and never sell or monetize your personal
          information.
        </p>
      </div>
      <InfoFooter />
    </main>
  );
}
