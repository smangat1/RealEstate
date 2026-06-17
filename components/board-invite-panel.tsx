"use client";

import { useState } from "react";

import type { BoardInvitationRecord } from "@/lib/types";

type BoardInvitePanelProps = {
  invitations: BoardInvitationRecord[];
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

export function BoardInvitePanel({ invitations }: BoardInvitePanelProps) {
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
                    <strong>{invitation.email}</strong>
                    <span>Pending invite</span>
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
                <p>Created {formatCreatedAt(invitation.createdAt)}</p>
              </article>
            );
          })
        ) : (
          <p className="settings-help-copy">
            No pending invites yet. Create one below and send the link to the exact email address that should join the board.
          </p>
        )}
      </div>
    </div>
  );
}
