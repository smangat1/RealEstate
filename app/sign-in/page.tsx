import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const email = typeof params.email === "string" ? params.email : "";
  const error = typeof params.error === "string" ? params.error : null;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const currentUser = await getCurrentAppUser();
  if (currentUser) redirect(next);

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro onboarding-intro">
            <div className="home-badge">Homeboard account</div>
            <h1>Sign in, then return to the board link.</h1>
            <p>
              The invitation stays attached to this flow. Your account email does not need to match the person who shared the link.
            </p>
            {notice ? <div className="account-message account-message-notice">{notice}</div> : null}
            {error ? <div className="account-message account-message-error">{error}</div> : null}
          </div>

          <section className="account-panel onboarding-panel">
            <div className="panel-heading">
              <strong>Sign in on the web</strong>
              <span>Use the email and password for your Homeboard web account.</span>
            </div>

            <form action={signInAction} className="account-form">
              <input type="hidden" name="next" value={next} />
              <label className="field-stack">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  defaultValue={email}
                  required
                />
              </label>
              <label className="field-stack">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <div className="register-actions">
                <Link href={next.startsWith("/invite/") ? next : "/"} className="secondary-button">
                  Back
                </Link>
                <button type="submit" className="account-primary-button">
                  Sign in and continue
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
