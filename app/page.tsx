import Link from "next/link";

import { signInAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { getRecentBoardsForUser } from "@/lib/board-data";
import { HomeExperience } from "@/components/home-experience";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser) {
    const params = await searchParams;
    const next = typeof params.next === "string" ? params.next : "/";
    const error = typeof params.error === "string" ? params.error : null;
    const notice = typeof params.notice === "string" ? params.notice : null;
    const email = typeof params.email === "string" ? params.email : "";
    const isInviteAuthMode = next.startsWith("/invite/");

    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout">
            <div className="account-intro">
              <div className="home-badge">
                Homeboard
              </div>
              <h1>
                {isInviteAuthMode
                  ? "Accept your invite and enter the workspace."
                  : "Plan the rental search together."}
              </h1>
              <p>
                {isInviteAuthMode
                  ? "You were invited into a shared Homeboard workspace. Sign in with the invited account so your identity, messages, and preferences attach to the right collaboration thread."
                  : "Homeboard helps roommates and co-searchers define constraints, compare listings, balance tradeoffs, and make one smarter rental decision together."}
              </p>

              <div className="account-launch-stats">
                <div className="account-feature">
                  <strong>Shared search profile</strong>
                  <span>
                    Every workspace starts with onboarding that turns messy group preferences into one structured profile everyone can edit.
                  </span>
                </div>
                <div className="account-feature">
                  <strong>Commute-aware matching</strong>
                  <span>
                    Listings are weighed against real commute anchors, neighborhood tradeoffs, and group priorities instead of a fake universal score.
                  </span>
                </div>
                <div className="account-feature">
                  <strong>One workspace for the whole group</strong>
                  <span>
                    Roommates share the same conversation, shortlist, notes, comparisons, and decisions so nobody loses the thread in screenshots and scattered texts.
                  </span>
                </div>
              </div>

              {error ? <div className="account-message account-message-error">{error}</div> : null}
              {notice ? <div className="account-message account-message-notice">{notice}</div> : null}

              <div className="account-feature-list">
                <div className="account-feature">
                  <strong>{isInviteAuthMode ? "Workspace access" : "Chat-led onboarding"}</strong>
                  <span>
                    {isInviteAuthMode
                      ? "Once you are in, the invite route will take you back to the exact workspace you were asked to join."
                      : "The shared chat collects move timing, budget, commute, neighborhoods, must-haves, and dealbreakers while building a structured profile behind the scenes."}
                  </span>
                </div>
                <div className="account-feature">
                  <strong>{isInviteAuthMode ? "Real identity in the room" : "Collaborative decision workspace"}</strong>
                  <span>
                    {isInviteAuthMode
                      ? "Invites are email-bound so each person shows up under the right account instead of borrowing someone else’s session."
                      : "Listings, notes, reactions, shortlist decisions, and group tradeoffs live in one shared workspace so everyone can see the same picture."}
                  </span>
                </div>
                <div className="account-feature">
                  <strong>{isInviteAuthMode ? "Profile comes after entry" : "Commute and neighborhood intelligence"}</strong>
                  <span>
                    {isInviteAuthMode
                      ? "After you join, you can fill in commute anchors and personal preferences so the group tradeoff model becomes more accurate."
                      : "Homeboard weighs commute practicality, neighborhood character, lifestyle fit, and budget pressure together instead of pretending one listing score tells the whole story."}
                  </span>
                </div>
                <div className="account-feature">
                  <strong>{isInviteAuthMode ? "One identity, one workspace voice" : "One workspace for the whole search"}</strong>
                  <span>
                    {isInviteAuthMode
                      ? "Your account becomes your actual presence inside the workspace, so your messages, invites, and preference updates stay attached to the right person."
                      : "Instead of juggling links, screenshots, and separate opinions, the workspace keeps the shared brief, shortlist, comments, and decisions in one place."}
                  </span>
                </div>
              </div>
            </div>

            <div className="account-panel-stack">
              <section className="account-panel">
                <div className="panel-heading">
                  <strong>{isInviteAuthMode ? "Need an account first?" : "Create your account"}</strong>
                  <span>
                    {isInviteAuthMode
                      ? "Create the invited account first, then come straight back to accept the workspace invite."
                      : "Create your account first so Homeboard can tie your workspaces, preferences, and collaboration history to a real identity."}
                  </span>
                </div>
                <div className="account-form">
                  <p className="account-secondary-copy">
                    {isInviteAuthMode
                      ? "Use the invited email address so the workspace can attach you to the right collaboration thread."
                      : "Account identity powers invites, collaboration, authorship, and every future decision made inside the workspace."}
                  </p>
                  <Link href={`/register?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`} className="account-primary-button account-link-button">
                    Create account
                  </Link>
                </div>
              </section>

              <section className="account-panel">
                <div className="panel-heading">
                  <strong>{isInviteAuthMode ? "Already have the invited account?" : "Return to your workspace"}</strong>
                  <span>Use the account that should speak inside shared workspaces.</span>
                </div>
                <form action={signInAction} className="account-form">
                  <input type="hidden" name="next" value={next} />
                  <label className="field-stack">
                    <span>Email</span>
                    <input name="email" type="email" placeholder="ava@homeboard.app" autoComplete="email" defaultValue={email} />
                  </label>
                  <label className="field-stack">
                    <span>Password</span>
                    <input name="password" type="password" placeholder="Your password" autoComplete="current-password" />
                  </label>
                  <p className="account-secondary-copy">
                    {isInviteAuthMode
                      ? "If someone invited you, sign in with that exact email address."
                      : "Sign in to pick up your current workspace, shared brief, and shortlist."}
                  </p>
                  <button type="submit" className="account-primary-button">Enter Homeboard</button>
                </form>
              </section>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <HomeExperience
      currentUser={currentUser}
      recentBoards={await getRecentBoardsForUser(currentUser.id)}
      isDemoEnabled={process.env.DEMO_MODE?.trim().toLowerCase() === "true"}
    />
  );
}
