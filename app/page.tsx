import { createBoardAction, deleteBoardAction, signInAction, signUpAction } from "@/app/actions";
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

    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout">
            <div className="account-intro">
              <div className="home-badge">Shared rental board</div>
              <h1>Sign in to Homeboard, then start or join a shared rental board.</h1>
              <p>
                Homeboard is a shared rental decision platform for roommates and co-searchers who want one place to define
                constraints, compare listings, balance tradeoffs, and make a smarter call together.
              </p>

              {error ? <div className="account-message account-message-error">{error}</div> : null}
              {notice ? <div className="account-message account-message-notice">{notice}</div> : null}

              <div className="account-feature-list">
                <div className="account-feature">
                  <strong>Shared search strategy</strong>
                  <span>The chat helps your group set budget, location, move-in timing, priorities, and dealbreakers without forcing everyone through one giant form.</span>
                </div>
                <div className="account-feature">
                  <strong>Collaborative decision board</strong>
                  <span>Listings, notes, reactions, shortlist decisions, and group tradeoffs live in one shared board so everyone can see the same picture.</span>
                </div>
                <div className="account-feature">
                  <strong>Commute and neighborhood intelligence</strong>
                  <span>Homeboard is being built to weigh commute practicality, neighborhood character, lifestyle fit, and budget pressure together instead of pretending one listing score tells the whole story.</span>
                </div>
              </div>
            </div>

            <div className="account-panel-stack">
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

              <section className="account-panel">
                <div className="panel-heading">
                  <strong>Create account</strong>
                  <span>Set up the identity your roommates will recognize.</span>
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
                  <label className="field-stack">
                    <span>Work address</span>
                    <input name="workAddress" placeholder="Optional commute anchor" autoComplete="street-address" />
                  </label>
                  <button type="submit" className="account-primary-button">Create account</button>
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
      createBoardAction={createBoardAction}
      deleteBoardAction={deleteBoardAction}
    />
  );
}
