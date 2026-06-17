import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptBoardInvitationAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getInvitationByCode } from "@/lib/board-data";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: inviteCode } = await params;
  if (!isAppEnabled()) {
    redirect("/?notice=Board%20invites%20are%20currently%20gated%20outside%20dev%20mode.");
  }
  const inviteData = await getInvitationByCode(inviteCode);

  if (!inviteData) {
    return (
      <main className="account-shell">
        <section className="account-card mac-window-card">
          <div className="account-layout single-panel-layout">
            <div className="account-intro">
              <div className="home-badge">Invite</div>
              <h1>This invite is gone.</h1>
              <p>It may have expired, been accepted, or never existed in the first place.</p>
              <Link href="/" className="secondary-button">Back home</Link>
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
              <div className="home-badge">Invite</div>
              <h1>This invite has already been used.</h1>
              <p>
                The link for {inviteData.invitation.email} is no longer pending. If someone still needs access, the board owner can
                generate a fresh invite.
              </p>
              <Link href="/" className="secondary-button">Back home</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect(`/?next=${encodeURIComponent(`/invite/${inviteCode}`)}&notice=${encodeURIComponent("Sign in to accept this board invite.")}`);
  }

  const emailMatches = currentUser.email.toLowerCase() === inviteData.invitation.email.toLowerCase();

  return (
    <main className="account-shell">
      <section className="account-card mac-window-card">
        <div className="account-layout single-panel-layout">
          <div className="account-intro">
            <div className="home-badge">Board invite</div>
            <h1>Join {inviteData.board.title}</h1>
            <p>
              {inviteData.invitedBy.displayName} invited <strong>{inviteData.invitation.email}</strong> into this shared rental board.
            </p>

            {!emailMatches ? (
              <div className="account-message account-message-error">
                You are signed in as {currentUser.email}, but this invite belongs to {inviteData.invitation.email}.
              </div>
            ) : null}

            <div className="account-feature-list">
              <div className="account-feature">
                <strong>Shared chat</strong>
                <span>Your messages will appear under your real account name inside the board.</span>
              </div>
              <div className="account-feature">
                <strong>Commute-aware setup</strong>
                <span>Your account work address can become part of the group tradeoff model later.</span>
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
