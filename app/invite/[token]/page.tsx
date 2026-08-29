import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache, type ReactNode } from "react";

import { acceptBoardInvitationAction } from "@/app/actions";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getInvitationByCode } from "@/lib/board-data";
import { getSiteUrl } from "@/lib/site-url";

import { InviteActions } from "./invite-actions";
import styles from "./invite.module.css";

type InvitePageProps = { params: Promise<{ token: string }> };

const getInvite = cache(getInvitationByCode);

function formatInviteExpiry(value: string | null) {
  if (!value) return "No fixed expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Expiry unavailable";

  return `Expires ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function getInstallURL() {
  const configured = process.env.NEXT_PUBLIC_IOS_INSTALL_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function referenceFor(token: string) {
  const clean = token.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `HB-${clean.slice(-6) || "INVITE"}`;
}

export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const { token } = await params;
  const inviteData = await getInvite(token);
  const isActive = Boolean(
    inviteData && !inviteData.wasExpired && inviteData.invitation.status === "pending",
  );
  const title = isActive && inviteData
    ? `Join ${inviteData.board.title} on Homeboard`
    : "Homeboard board invitation";
  const description = isActive && inviteData
    ? `${inviteData.invitedBy.displayName} invited you to a shared rental board.`
    : "Open this private Homeboard invitation to continue.";
  const imageURL = `/api/invite-og?token=${encodeURIComponent(token)}`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Homeboard",
      url: `/invite/${encodeURIComponent(token)}`,
      title,
      description,
      images: [{ url: imageURL, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageURL],
    },
  };
}

function InviteFrame({
  token,
  eyebrow,
  title,
  description,
  boardTitle,
  invitedBy,
  expiry,
  children,
}: {
  token: string;
  eyebrow: string;
  title: string;
  description: string;
  boardTitle?: string;
  invitedBy?: string;
  expiry?: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.main}>
          <header className={styles.brandRow}>
            <Link href="/" className={styles.brand} aria-label="Homeboard home">
              <span className={styles.logoBox}>
                <Image src="/brand/homeboard-mark.svg" alt="" width={38} height={39} aria-hidden="true" priority />
              </span>
              <span>HOMEBOARD</span>
            </Link>
            <span className={styles.privatePill}>Private invitation</span>
          </header>

          <div className={styles.hero}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
            <p className={styles.description}>{description}</p>
          </div>

          <div className={styles.referenceRow}>
            <div>
              <span>Link reference</span>
              <strong>{referenceFor(token)}</strong>
            </div>
            <div className={styles.referenceMeta}>
              <i aria-hidden="true" />
              <span>{expiry || "Private link"}</span>
            </div>
          </div>

          {children}
        </div>

        <aside className={styles.side}>
          <div className={styles.sideBrand}>
            <span aria-hidden="true" />
            <strong>One search. Every tradeoff visible.</strong>
          </div>

          <div className={styles.steps}>
            <div className={styles.step}>
              <b>01</b>
              <div>
                <strong>Open or install</strong>
                <p>An installed Homeboard app claims this link automatically.</p>
              </div>
            </div>
            <div className={styles.step}>
              <b>02</b>
              <div>
                <strong>Continue with Apple</strong>
                <p>Hide My Email works. The secure link carries the invitation.</p>
              </div>
            </div>
            <div className={styles.step}>
              <b>03</b>
              <div>
                <strong>Join the decision</strong>
                <p>Add your commute, budget, reactions, and dealbreakers to the same board.</p>
              </div>
            </div>
          </div>

          <footer className={styles.sideFooter}>
            <p>{invitedBy ? "Invited by" : "Homeboard"}</p>
            <strong>{invitedBy || "Pick the home together."}</strong>
            {boardTitle ? <p>{boardTitle}</p> : null}
          </footer>
        </aside>
      </section>
    </main>
  );
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token: inviteCode } = await params;
  const nativeInviteURL = `homeboard://invite/${encodeURIComponent(inviteCode)}`;
  const inviteURL = new URL(`/invite/${encodeURIComponent(inviteCode)}`, getSiteUrl()).toString();
  const installURL = getInstallURL();

  if (!isAppEnabled()) {
    redirect("/?notice=Workspace%20invites%20are%20currently%20disabled.");
  }

  const inviteData = await getInvite(inviteCode);
  if (!inviteData) {
    return (
      <InviteFrame
        token={inviteCode}
        eyebrow="Invitation unavailable"
        title="This link is gone."
        description="It may have been replaced or never existed. Ask the board owner for a fresh Homeboard link."
      >
        <div className={styles.stateActions}>
          <Link href="/" className={styles.textLink}>Back to Homeboard</Link>
        </div>
      </InviteFrame>
    );
  }

  if (inviteData.wasExpired) {
    return (
      <InviteFrame
        token={inviteCode}
        eyebrow="Invitation expired"
        title="This link needs a refresh."
        description="Ask the board owner to create a new invitation. Replacing a link keeps the workspace private."
      >
        <Link href="/" className={styles.textLink}>Back to Homeboard</Link>
      </InviteFrame>
    );
  }

  if (inviteData.invitation.status !== "pending") {
    const wasAccepted = inviteData.invitation.status === "accepted";
    return (
      <InviteFrame
        token={inviteCode}
        eyebrow={wasAccepted ? "Invitation accepted" : "Invitation closed"}
        title={wasAccepted ? "Already on the board?" : "This link was replaced."}
        description={wasAccepted
          ? "If this was your invitation, opening Homeboard will return you to the shared board."
          : "Ask the board owner to send the current invitation link."}
      >
        {wasAccepted ? (
          <InviteActions
            nativeURL={nativeInviteURL}
            installURL={installURL}
            inviteURL={inviteURL}
          />
        ) : (
          <Link href="/" className={styles.textLink}>Back to Homeboard</Link>
        )}
      </InviteFrame>
    );
  }

  const sharedFrame = {
    token: inviteCode,
    boardTitle: inviteData.board.title,
    invitedBy: inviteData.invitedBy.displayName,
    expiry: formatInviteExpiry(inviteData.invitation.expiresAt),
  };
  const currentUser = await getCurrentAppUser();
  return (
    <InviteFrame
      {...sharedFrame}
      eyebrow="You are invited"
      title={`Join ${inviteData.board.title}`}
      description={`${inviteData.invitedBy.displayName} shared a private Homeboard rental search with you.`}
    >
      {currentUser ? (
        <div className={styles.stateActions}>
          <form action={acceptBoardInvitationAction}>
            <input type="hidden" name="inviteCode" value={inviteCode} />
            <button type="submit" className={styles.joinButton}>
              <span>Join this board</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <InviteActions
            nativeURL={nativeInviteURL}
            installURL={installURL}
            inviteURL={inviteURL}
          />
        </div>
      ) : (
        <>
          <InviteActions
            nativeURL={nativeInviteURL}
            installURL={installURL}
            inviteURL={inviteURL}
          />
          <div className={styles.webAccountLinks}>
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/invite/${inviteCode}`)}&notice=${encodeURIComponent("Sign in to accept this board invitation.")}`}
              className={styles.textLink}
            >
              Sign in on the web
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(`/invite/${inviteCode}`)}`}
              className={styles.textLink}
            >
              Create a web account
            </Link>
          </div>
        </>
      )}
    </InviteFrame>
  );
}
