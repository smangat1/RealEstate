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
                <strong>Account information:</strong> Your name and email
                address when you register using email and password or Sign in
                with Apple.
              </p>
              <p>
                <strong>Group house-hunting content:</strong> Shared boards,
                shortlisted listings, group chat messages, message replies,
                listing comments, roommate votes, custom ratings, reviews,
                tour availability, and roommate decision votes.
              </p>
              <p>
                <strong>Housing and commute preferences:</strong> Target
                neighborhoods, budget ranges, move-in dates, priorities,
                must-haves, dealbreakers, and saved commute destinations or
                work addresses.
              </p>
              <p>
                <strong>Listing photos:</strong> Photos you upload for listings
                are stored in private cloud storage and optimized for the app.
              </p>
              <p>
                <strong>Shared expenses:</strong> House-hunting costs you log on
                a board (such as application fees, deposits, or moving
                expenses) to calculate roommate split balances.
              </p>
              <p>
                <strong>Device tokens and pairings:</strong> Apple Push
                Notification service (APNs) device tokens and time zones (if you
                enable notifications), and cryptographic pairing codes if you
                connect a Mac or browser companion.
              </p>
              <p>
                <strong>Payment contribution records:</strong> If you fund a
                shared subscription via Stripe, we store the Stripe payment
                identifier and contribution amount. We never see or store your
                payment card or bank numbers.
              </p>
              <p>
                <strong>First-party operational activity:</strong> Essential
                product events (like creating a board or importing a listing)
                are logged in our database to keep the service working and
                troubleshoot problems.
              </p>
            </div>
          </article>

          <article>
            <h2>What stays on your device</h2>
            <div style={sectionBodyStyle}>
              <p>
                <strong>Private financial inputs:</strong> Sensitive numbers
                entered into the Advisor financial tool (such as individual
                income or credit score ranges) are saved on your device in the
                iOS Keychain. They are not stored on our application servers.
              </p>
              <p>
                <strong>Local commute routing:</strong> Travel times and commute
                routes are calculated on your device using Apple MapKit.
              </p>
            </div>
          </article>

          <article>
            <h2>What we never collect</h2>
            <div style={sectionBodyStyle}>
              <p>
                We never sell or rent your personal data to brokerages,
                advertisers, or data brokers.
              </p>
              <p>
                No third-party advertising SDKs or tracking networks (no ad
                pixels, no cross-app tracking).
              </p>
              <p>
                No bank account or credit card numbers stored on our servers
                (payments are handled directly by Stripe).
              </p>
              <p>
                No retention dark patterns. You can delete your account at any
                time directly in app settings.
              </p>
            </div>
          </article>

          <article>
            <h2>Third parties</h2>
            <div style={sectionBodyStyle}>
              <p>
                We use trusted third parties strictly to operate the service:
              </p>
              <p>
                <strong>Supabase:</strong> Database hosting, authentication
                (including Sign in with Apple), and private storage for
                uploaded listing photos.
              </p>
              <p>
                <strong>Vercel:</strong> Web application hosting and API
                routing.
              </p>
              <p>
                <strong>Apple:</strong> Sign in with Apple (authentication),
                Apple MapKit (commute calculations and map data), and Apple
                Push Notification service (delivering push alerts).
              </p>
              <p>
                <strong>Stripe:</strong> Payment processing for board wallet
                funding and shared subscriptions.
              </p>
              <p>
                <strong>Sentry:</strong> Error tracking, crash reporting, and
                diagnostic trace ingestion. Sentry requests automatically
                scrub personal data, tokens, and query strings.
              </p>
              <p>
                <strong>RentCast:</strong> Rental listing data provider used for
                public catalog comparison data.
              </p>
            </div>
          </article>

          <article>
            <h2>Notifications</h2>
            <div style={sectionBodyStyle}>
              <p>
                Push notification device tokens are stored only if you choose to
                enable notifications.
              </p>
              <p>
                Notifications keep you informed about board updates, new
                listings, and messages. You can change your preferences or turn
                notifications off at any time in iOS Settings.
              </p>
            </div>
          </article>

          <article>
            <h2>Bug reports and diagnostics</h2>
            <div style={sectionBodyStyle}>
              <p>
                If you voluntarily submit an in-app bug report, we receive your
                description, app version, device kind, and a diagnostic trace.
                The trace automatically redacts authentication tokens, email
                addresses, and web links.
              </p>
              <p>
                Diagnostic crash and performance traces (such as MetricKit logs)
                may be sent to Sentry to help us fix crashes.
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
                Account deletion removes your user profile, authentication
                credentials, uploaded photos, chat messages, and owned boards.
              </p>
              <p>
                Deleted listings on a board remain in a recently-deleted view
                for a short recovery window before permanent removal.
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
              <a
                className={styles.emailLink}
                href="mailto:homeboard.support@gmail.com"
              >
                homeboard.support@gmail.com
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
