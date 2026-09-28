export function analyzeAdvisorReply(text: string) {
  const lower = text.toLowerCase();
  const price = text.match(/\$\s*([\d,]{3,})/)?.[1]?.replace(/,/g, "");
  const unavailable = /rented|leased|off[ -]?market|no longer available|already taken/.test(lower);
  const application = /application|apply|documents?|proof of income|credit check/.test(lower);
  const tour = /tour|viewing|showing|\bshow\b|come by|appointment/.test(lower);
  const available = !unavailable && /available|still open|still on the market/.test(lower);
  const nextMove = unavailable
    ? "Confirm whether the agent has a comparable unit, then move this listing out of the active shortlist."
    : application
      ? "Open the application packet, verify the application channel, and send only the requested documents."
      : tour
        ? "Reply with two or three concrete time windows and ask who will provide access."
        : available
          ? "Ask for the earliest tour window and the complete fee sheet before sharing sensitive information."
          : "Ask one direct clarifying question and keep the listing in waiting until the broker answers it.";
  const summary = unavailable
    ? "The reply says the listing is no longer available."
    : application
      ? "The reply moves the conversation toward an application or document request."
      : tour
        ? "The reply discusses a tour or showing."
        : available
          ? "The reply indicates the listing may still be available."
          : "The reply does not contain a clear availability, tour, or application decision.";
  return {
    summary,
    nextMove,
    facts: {
      available: available ? true : unavailable ? false : null,
      mentionsApplication: application,
      mentionsTour: tour,
      quotedPrice: price ? Number(price) : null,
    },
  };
}
