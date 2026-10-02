export function replyLogConfirmation(suppressedCount: number) {
  const followUpCancelled = suppressedCount > 0;
  return {
    followUpCancelled,
    message: followUpCancelled
      ? "Reply logged. Follow-up cancelled."
      : "Reply logged.",
  };
}

export function preferenceResolutionConfirmation(status: "accepted" | "rejected") {
  return status === "accepted" ? "Preference updated" : "No change made";
}

export function outreachConfirmation(input: {
  recorded: boolean;
  followUpScheduledFor?: string | null;
}) {
  if (!input.recorded) return null;
  return input.followUpScheduledFor
    ? `Marked sent. Follow-up scheduled for ${input.followUpScheduledFor}`
    : "Marked sent.";
}
