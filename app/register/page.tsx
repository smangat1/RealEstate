import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const appEnabled = isAppEnabled();
  const currentUser = await getCurrentAppUser();
  if (currentUser && appEnabled) {
    redirect("/");
  }

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro onboarding-intro">
            <div className="home-badge">{appEnabled ? "Professional account setup" : "Account registration"}</div>
            <h1>
              {appEnabled
                ? "Create your account first. The onboarding happens in chat after you get in."
                : "Create your account now so you are ready when Homeboard opens beyond the private alpha."}
            </h1>
            <p>
              {appEnabled
                ? "Homeboard sign-up should feel like real product auth, not a bloated intake form. Create your account here, verify it if your auth settings require email confirmation, then let the shared board chat build the rental profile live."
                : "This page is still real account creation, but public mode stops before the private board product. Registration and the waitlist stay open while the live app remains gated."}
            </p>

            {error ? <div className="account-message account-message-error">{error}</div> : null}
          </div>

          <section className="account-panel onboarding-panel">
            <div className="panel-heading">
              <strong>Create account</strong>
              <span>
                {appEnabled
                  ? "Name, email, and password now. Search preferences later in the actual onboarding chat."
                  : "Name, email, and password now. Live board access comes later when the app gate opens."}
              </span>
            </div>

            <form action={signUpAction} className="account-form">
              <input type="hidden" name="next" value={next} />

              <label className="field-stack">
                <span>Name</span>
                <input name="displayName" placeholder="Ava Chen" autoComplete="name" />
              </label>
              <label className="field-stack">
                <span>Email</span>
                <input name="email" type="email" placeholder="ava@homeboard.app" autoComplete="email" />
              </label>
              <label className="field-stack">
                <span>Password</span>
                <input name="password" type="password" placeholder="At least 6 characters" autoComplete="new-password" />
              </label>

              <div className="register-actions">
                <Link href="/" className="secondary-button">
                  Back
                </Link>
                <button type="submit" className="account-primary-button">
                  Create account
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
