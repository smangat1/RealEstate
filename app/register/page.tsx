import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { getInvitationByCode } from "@/lib/board-data";

function getInviteCode(nextPath: string) {
  const match = /^\/invite\/([^/?#]+)$/.exec(nextPath);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentAppUser();
  if (currentUser) {
    redirect("/");
  }

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;
  const email = typeof params.email === "string" ? params.email : "";
  const inviteCode = getInviteCode(next);
  const inviteData = inviteCode ? await getInvitationByCode(inviteCode) : null;
  const isActiveInvite = Boolean(
    inviteData && !inviteData.wasExpired && inviteData.invitation.status === "pending",
  );

  if (!isActiveInvite || !inviteData) {
    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout single-panel-layout">
            <div className="account-intro onboarding-intro">
              <div className="home-badge">Invitation-only beta</div>
              <h1>Homeboard accounts start with an active board invite.</h1>
              <p>
                Ask a Homeboard member to share a fresh invite link. Opening that link will bring you back here with the right workspace attached.
              </p>
              {error ? <div className="account-message account-message-error">{error}</div> : null}
              <div className="register-actions">
                <Link href="/" className="secondary-button">Back to Homeboard</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro onboarding-intro">
            <div className="home-badge">Homeboard account</div>
            <h1>
              Create the account that should join this shared workspace.
            </h1>
            <p>
              Create your account here. Then return to accept the shared workspace invite. The link carries the invitation. Your email address does not.
            </p>

            {error ? <div className="account-message account-message-error">{error}</div> : null}
          </div>

          <section className="account-panel onboarding-panel">
              <div className="panel-heading">
                <strong>Create account</strong>
                <span>
                  Name, email, and password now. Your move details, budget, commute, and group constraints come later inside the live onboarding flow.
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
                <input
                  name="email"
                  type="email"
                  placeholder="ava@homeboard.app"
                  autoComplete="email"
                  defaultValue={email}
                />
              </label>
              <label className="field-stack">
                <span>Password</span>
                <input name="password" type="password" placeholder="At least 6 characters" autoComplete="new-password" />
              </label>

              <div className="register-actions">
                <Link href={`/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`} className="secondary-button">
                  Back to sign in
                </Link>
                <button type="submit" className="account-primary-button">
                  Create account and continue
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
