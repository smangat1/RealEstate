"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [supabase] = useState(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key
      ? createClient(url, key, { auth: { detectSessionInUrl: true, persistSession: true } })
      : null;
  });
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setError("Password recovery is not configured on this Homeboard environment.");
      setIsChecking(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session));
      setIsChecking(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setHasRecoverySession(Boolean(session));
      setIsChecking(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setIsSaving(true);
    if (!supabase) {
      setIsSaving(false);
      setError("Password recovery is not configured on this Homeboard environment.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setComplete(true);
    await supabase.auth.signOut();
  }

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro onboarding-intro">
            <div className="home-badge">Account recovery</div>
            <h1>{complete ? "Your password is ready." : "Choose a new Homeboard password."}</h1>
            <p>
              {complete
                ? "Return to Homeboard and sign in with the password you just created."
                : "This recovery page only works from the private link sent to your account email."}
            </p>
          </div>

          <section className="account-panel onboarding-panel">
            {complete ? (
              <div className="register-actions">
                <Link href="/" className="account-primary-button account-link-button">
                  Return to sign in
                </Link>
              </div>
            ) : isChecking ? (
              <div className="account-message account-message-notice">Checking the recovery link…</div>
            ) : !hasRecoverySession ? (
              <>
                <div className="account-message account-message-error">
                  This recovery link is missing, expired, or has already been used. Request a new one from the Homeboard app.
                </div>
                <div className="register-actions">
                  <Link href="/" className="secondary-button">Back to Homeboard</Link>
                </div>
              </>
            ) : (
              <form className="account-form" onSubmit={updatePassword}>
                <label className="field-stack">
                  <span>New password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className="field-stack">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
                {error ? <div className="account-message account-message-error">{error}</div> : null}
                <button type="submit" className="account-primary-button" disabled={isSaving}>
                  {isSaving ? "Updating password…" : "Update password"}
                </button>
              </form>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
