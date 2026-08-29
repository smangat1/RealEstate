"use client";

import { useState } from "react";
import { revokeBoardInvitationAction } from "@/app/actions";

import type { BoardInvitationRecord } from "@/lib/types";

type BoardInvitePanelProps = {
  boardId: string;
  invitations: BoardInvitationRecord[];
  redirectTo?: string;
  emptyMessage?: string;
};

function buildInviteUrl(inviteCode: string) {
  if (typeof window === "undefined") return `/invite/${inviteCode}`;
  return `${window.location.origin}/invite/${inviteCode}`;
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatExpiry(value: string | null) {
  if (!value) return "No expiration";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No expiration";

  const hoursRemaining = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
  if (hoursRemaining <= 0) return "Expired";
  if (hoursRemaining < 24) return `Expires in ${hoursRemaining}h`;

  return `Expires ${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}`;
}

export function BoardInvitePanel({
  boardId,
  invitations,
  redirectTo = `/settings?boardId=${boardId}`,
  emptyMessage = "No pending invite link yet. Create one and send it through Messages, Mail, or any other app.",
}: BoardInvitePanelProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function copyInvite(inviteCode: string) {
    const inviteUrl = buildInviteUrl(inviteCode);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedCode(inviteCode);
      window.setTimeout(() => setCopiedCode((current) => (current === inviteCode ? null : current)), 1800);
    } catch {
      setCopiedCode(null);
    }
  }

  return (
    <div className="invite-panel">
      <div className="invite-panel-list">
        {invitations.length > 0 ? (
          invitations.map((invitation) => {
            const inviteUrl = buildInviteUrl(invitation.inviteCode);

            return (
              <article key={invitation.id} className="invite-summary-card">
                <div className="invite-summary-head">
                  <div>
                    <strong>Single-use board link</strong>
                    <span>{formatExpiry(invitation.expiresAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void copyInvite(invitation.inviteCode)}
                  >
                    {copiedCode === invitation.inviteCode ? "Copied" : "Copy link"}
                  </button>
                </div>
                <a href={inviteUrl}>{inviteUrl}</a>
                <div className="invite-summary-actions">
                  <p>Created {formatCreatedAt(invitation.createdAt)}</p>
                  <form action={revokeBoardInvitationAction}>
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <input type="hidden" name="boardId" value={boardId} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <button type="submit" className="secondary-button">Revoke</button>
                  </form>
                </div>
              </article>
            );
          })
        ) : (
          <p className="settings-help-copy">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
