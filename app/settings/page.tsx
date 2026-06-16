import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction, updateSettingsAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";

export default async function SettingsPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }

  return (
    <main className="settings-shell">
      <section className="settings-page-card mac-window-card">
        <div className="settings-header">
          <div>
            <div className="home-badge">Account settings</div>
            <h1>Manage the identity that shows up inside shared boards.</h1>
            <p>Your work address and display name stay attached to your real account now, not a local profile picker.</p>
          </div>
          <div className="settings-header-actions">
            <form action={signOutAction}>
              <button type="submit" className="secondary-button">Sign out</button>
            </form>
            <Link href="/" className="secondary-button">
              Back to boards
            </Link>
          </div>
        </div>

        <div className="settings-grid settings-grid-single">
          <section className="settings-section">
            <h2>Your account</h2>
            <form action={updateSettingsAction} className="account-form">
              <label className="field-stack">
                <span>Name</span>
                <input name="displayName" defaultValue={currentUser.displayName} placeholder="Your name" />
              </label>
              <label className="field-stack">
                <span>Email</span>
                <input value={currentUser.email} disabled readOnly />
              </label>
              <label className="field-stack">
                <span>Primary commute destination</span>
                <input
                  name="workAddress"
                  defaultValue={currentUser.workAddress ?? ""}
                  placeholder="Office, campus, or main weekday destination"
                />
              </label>
              <label className="field-stack">
                <span>Secondary commute destination</span>
                <input
                  name="secondaryWorkAddress"
                  defaultValue={currentUser.secondaryWorkAddress ?? ""}
                  placeholder="Optional second office, campus, or recurring destination"
                />
              </label>
              <button type="submit" className="account-primary-button">Save settings</button>
            </form>
            <p className="settings-help-copy">
              These destinations are used as commute anchors when Homeboard compares listings. If you only have one place you
              regularly need to get to, leave the secondary field empty.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
