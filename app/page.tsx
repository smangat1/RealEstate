import Link from "next/link";

import { signInAction, submitWaitlistAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getRecentBoardsForUser } from "@/lib/board-data";
import { HomeExperience } from "@/components/home-experience";
import { WaitlistSuccessOverlay } from "@/components/waitlist-success-overlay";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const appEnabled = isAppEnabled();
  const currentUser = await getCurrentAppUser();

  if (!appEnabled || !currentUser) {
    const params = await searchParams;
    const next = typeof params.next === "string" ? params.next : "/";
    const error = typeof params.error === "string" ? params.error : null;
    const notice = typeof params.notice === "string" ? params.notice : null;
    const success = typeof params.success === "string" ? params.success : null;
    const isPublicMode = !appEnabled;
    const isSignedOutAppMode = appEnabled && !currentUser;
    const shouldShowWaitlistSuccess = success === "waitlist_joined";
    const inlineNotice = shouldShowWaitlistSuccess ? null : notice;

    return (
      <main className={`account-shell ${!currentUser ? "waitlist-shell" : ""}`}>
        <WaitlistSuccessOverlay
          open={shouldShowWaitlistSuccess}
          message={notice || "You’re on the waitlist. We’ll reach out when the next Homeboard beta round opens."}
        />
        <section className={`account-card mac-window-card ${!currentUser ? "waitlist-card" : ""}`}>
          <div className={`account-layout ${!currentUser ? "public-launch-layout" : ""}`}>
            <div className="account-intro">
              <div className="home-badge">
                {isPublicMode ? "Homeboard waitlist" : "Shared rental board"}
              </div>
              <h1>
                {isSignedOutAppMode
                  ? "Sign in to Homeboard, then start or join a shared rental board."
                  : "Plan the search together before the lease chaos starts."}
              </h1>
              <p>
                {isSignedOutAppMode
                  ? "Homeboard is a shared rental decision platform for roommates and co-searchers who want one place to define constraints, compare listings, balance tradeoffs, and make a smarter call together."
                  : "Homeboard is being built as the shared workspace for apartment hunts: one place for roommates to align on budget, neighborhoods, commute reality, must-haves, dealbreakers, and the listings worth fighting for."}
              </p>

              {!currentUser ? (
                <div className="account-launch-stats">
                  <div className="account-feature">
                    <strong>Shared search profile</strong>
                    <span>
                      Every board starts with onboarding that turns messy group preferences into one structured profile the whole group can edit.
                    </span>
                  </div>
                  <div className="account-feature">
                    <strong>Commute-aware matching</strong>
                    <span>
                      Listings are meant to be weighed against real commute anchors, neighborhood tradeoffs, and group priorities instead of a fake universal score.
                    </span>
                  </div>
                  <div className="account-feature">
                    <strong>One board for the whole group</strong>
                    <span>
                      Roommates share the same conversation, shortlist, notes, comparisons, and decisions so nobody loses the thread in screenshots and scattered texts.
                    </span>
                  </div>
                </div>
              ) : null}

              {error ? <div className="account-message account-message-error">{error}</div> : null}
              {inlineNotice ? <div className="account-message account-message-notice">{inlineNotice}</div> : null}

              <div className="account-feature-list">
                {isPublicMode ? (
                  <>
                    <div className="account-feature">
                      <strong>What the product does</strong>
                      <span>
                        Homeboard is meant to help groups define constraints quickly, surface the right listings, and keep the decision process collaborative from first message to signed lease.
                      </span>
                    </div>
                    <div className="account-feature">
                      <strong>Why join early</strong>
                      <span>
                        The waitlist is for renters, roommate groups, and recent grads who want early access once shared boards, live invites, and commute-aware comparisons are ready for broader rollout.
                      </span>
                    </div>
                    <div className="account-feature">
                      <strong>Current access model</strong>
                      <span>
                        Right now the full product stays gated unless you are running in dev mode. Public visitors can join the waitlist so interest is captured before wider access opens.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="account-feature">
                      <strong>Chat-led onboarding</strong>
                      <span>
                        The board chat collects move timing, budget, commute, neighborhoods, must-haves, and dealbreakers while building a structured profile behind the scenes.
                      </span>
                    </div>
                    <div className="account-feature">
                      <strong>Collaborative decision board</strong>
                      <span>
                        Listings, notes, reactions, shortlist decisions, and group tradeoffs live in one shared board so everyone can see the same picture.
                      </span>
                    </div>
                    <div className="account-feature">
                      <strong>Commute and neighborhood intelligence</strong>
                      <span>
                        Homeboard is being built to weigh commute practicality, neighborhood character, lifestyle fit, and budget pressure together instead of pretending one listing score tells the whole story.
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="account-panel-stack">
              {isPublicMode ? (
                <section className="account-panel waitlist-primary-panel">
                  <div className="panel-heading">
                    <strong>Join the waitlist</strong>
                    <span>Tell us where you are searching and what is frustrating your group right now.</span>
                  </div>
                  <form action={submitWaitlistAction} className="account-form">
                    <input type="hidden" name="source" value="landing-page" />
                    <label className="field-stack">
                      <span>Name</span>
                      <input name="name" placeholder="Ava Chen" autoComplete="name" />
                    </label>
                    <label className="field-stack">
                      <span>Email</span>
                      <input name="email" type="email" placeholder="ava@school.edu" autoComplete="email" />
                    </label>
                    <div className="account-form-grid account-form-grid-2">
                      <label className="field-stack">
                        <span>City</span>
                        <input name="city" placeholder="New York City" />
                      </label>
                      <label className="field-stack">
                        <span>Move-in timeline</span>
                        <input name="moveInTimeline" placeholder="August" />
                      </label>
                    </div>
                    <div className="account-form-grid account-form-grid-2">
                      <label className="field-stack">
                        <span>Group size</span>
                        <input name="groupSize" placeholder="3" inputMode="numeric" />
                      </label>
                      <label className="field-stack">
                        <span>Would you invite roommates?</span>
                        <select name="willingToInviteRoommates" defaultValue="">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                    </div>
                    <label className="field-stack">
                      <span>Biggest frustration</span>
                      <textarea name="biggestFrustration" rows={3} placeholder="What breaks down when your group searches together right now?" />
                    </label>
                    <div className="account-toggle-grid">
                      <label className="field-stack">
                        <span>Searching with roommates</span>
                        <select name="hasRoommates" defaultValue="">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                      <label className="field-stack">
                        <span>Actively searching</span>
                        <select name="activelySearching" defaultValue="">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                      <label className="field-stack">
                        <span>Open to beta testing</span>
                        <select name="willingToBetaTest" defaultValue="">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="account-primary-button">
                      Join waitlist
                    </button>
                  </form>
                </section>
              ) : (
                <>
                  <section className="account-panel">
                    <div className="panel-heading">
                      <strong>Create your account</strong>
                      <span>Register first so your board identity is ready before you enter the shared rental workspace.</span>
                    </div>
                    <div className="account-form">
                      <p className="account-secondary-copy">
                        Homeboard uses real account identity so invites, collaboration, and board activity are tied to actual people instead of temporary local profiles.
                      </p>
                      <Link href={`/register?next=${encodeURIComponent(next)}`} className="account-primary-button account-link-button">
                        Go to registration
                      </Link>
                    </div>
                  </section>

                  <section className="account-panel">
                    <div className="panel-heading">
                      <strong>Sign in</strong>
                      <span>Use the account that should speak inside shared boards.</span>
                    </div>
                    <form action={signInAction} className="account-form">
                      <input type="hidden" name="next" value={next} />
                      <label className="field-stack">
                        <span>Email</span>
                        <input name="email" type="email" placeholder="ava@homeboard.app" autoComplete="email" />
                      </label>
                      <label className="field-stack">
                        <span>Password</span>
                        <input name="password" type="password" placeholder="Your password" autoComplete="current-password" />
                      </label>
                      <button type="submit" className="account-primary-button">Sign in</button>
                    </form>
                  </section>
                </>
              )}
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
