import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptBoardInvitationAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getInvitationByCode } from "@/lib/board-data";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: inviteCode } = await params;
  if (!isAppEnabled()) {
    redirect("/?notice=Workspace%20invites%20are%20currently%20disabled.");
  }
  const inviteData = await getInvitationByCode(inviteCode);

  if (!inviteData) {
    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout single-panel-layout">
            <div className="account-intro">
              <div className="home-badge">Workspace invite</div>
              <h1>This invite is gone.</h1>
              <p>It may have expired, already been used, or never existed in the first place.</p>
              <Link href="/" className="secondary-button">Back to Homeboard</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (inviteData.invitation.status !== "pending") {
    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout single-panel-layout">
            <div className="account-intro">
              <div className="home-badge">Workspace invite</div>
              <h1>{inviteData.invitation.status === "accepted" ? "This invite has already been accepted." : "This invite is no longer active."}</h1>
              <p>
                The link for {inviteData.invitation.email} is no longer pending. If someone still needs access, the workspace owner can
                generate a fresh link from the workspace.
              </p>
              <div className="register-actions">
                <Link href="/" className="secondary-button">Back to Homeboard</Link>
                <Link href={`/boards/${inviteData.board.id}`} className="account-primary-button account-link-button">Open workspace</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout single-panel-layout">
            <div className="account-intro">
              <div className="home-badge">Workspace invite</div>
              <h1>Join {inviteData.board.title}</h1>
              <p>
                {inviteData.invitedBy.displayName} invited <strong>{inviteData.invitation.email}</strong> into this shared Homeboard workspace.
              </p>

              <div className="account-feature-list">
                <div className="account-feature">
                  <strong>Use the invited email</strong>
                  <span>Create or sign into the account for {inviteData.invitation.email} so the workspace can attach your identity correctly.</span>
                </div>
                <div className="account-feature">
                  <strong>Then accept the invite</strong>
                  <span>Once auth is done, this link will bring you right back here to join the workspace.</span>
                </div>
              </div>

              <div className="register-actions">
                <Link
                  href={`/?next=${encodeURIComponent(`/invite/${inviteCode}`)}&email=${encodeURIComponent(inviteData.invitation.email)}&notice=${encodeURIComponent("Sign in to accept this workspace invite.")}`}
                  className="secondary-button"
                >
                  Sign in
                </Link>
                <Link
                  href={`/register?next=${encodeURIComponent(`/invite/${inviteCode}`)}&email=${encodeURIComponent(inviteData.invitation.email)}`}
                  className="account-primary-button account-link-button"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const emailMatches = currentUser.email.toLowerCase() === inviteData.invitation.email.toLowerCase();

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro">
            <div className="home-badge">Workspace invite</div>
            <h1>Join {inviteData.board.title}</h1>
            <p>
              {inviteData.invitedBy.displayName} invited <strong>{inviteData.invitation.email}</strong> into this shared Homeboard workspace.
            </p>

            {!emailMatches ? (
              <div className="account-message account-message-error">
                You are signed in as {currentUser.email}, but this invite belongs to {inviteData.invitation.email}.
              </div>
            ) : null}

            <div className="account-feature-list">
              <div className="account-feature">
                <strong>Shared chat</strong>
                <span>Your messages will appear under your real account name inside the workspace.</span>
              </div>
              <div className="account-feature">
                <strong>Commute-aware setup</strong>
                <span>Your commute anchors and preferences can become part of the group tradeoff model as soon as you join.</span>
              </div>
            </div>

            {emailMatches ? (
              <form action={acceptBoardInvitationAction}>
                <input type="hidden" name="inviteCode" value={inviteCode} />
                <button type="submit" className="account-primary-button">Accept invite</button>
              </form>
            ) : (
              <Link href="/" className="secondary-button">Use a different account</Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
