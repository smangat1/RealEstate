"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteBoardAction,
  saveSuggestedListingAction,
  sendChatAction,
} from "@/app/actions";
import type {
  AuthUserRecord,
  BoardListingCommentRecord,
  BoardListingRecord,
  BoardListingVoteRecord,
  BoardPageData,
  SuggestedListingRecord,
} from "@/lib/types";

type BoardExperienceProps = {
  currentUser: AuthUserRecord | null;
  data: BoardPageData;
  recentBoards: Array<{ id: string; title: string; updatedAt: string }>;
};

const VOTE_ORDER = ["love", "like", "maybe", "pass", "veto"] as const;
const SHORTLIST_STATUS_OPTIONS = ["all", "new", "interested", "maybe", "toured", "applied"] as const;
const SORT_OPTIONS = ["updated", "price-asc", "price-desc", "bedrooms-desc"] as const;
const LISTING_METHODS = ["pasted_link", "pasted_text", "manual"] as const;

function matchesDirectNycDemoRequest(message: string) {
  const lower = message.toLowerCase();
  return (
    /new york|nyc|new york city/.test(lower) &&
    /\bhouse\b/.test(lower) &&
    (/2 bedroom|2 bed|two bedroom|two bed/.test(lower)) &&
    (/<\s*\$?\s*5000|less than\s*\$?\s*5000|under\s*\$?\s*5000/.test(lower)) &&
    /\bjuly\b/.test(lower)
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBoardTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 54) return normalized;
  return `${normalized.slice(0, 51)}...`;
}

function compareLocationLabel(item: BoardListingRecord) {
  return [item.listing.neighborhood, item.listing.city].filter(Boolean).join(", ") || item.listing.address || "Untitled listing";
}

function formatCommuteSnippet(commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined) {
  if (!commute || commute.bestDurationMinutes === null) return "Commute still unavailable";
  return `${commute.bestDurationMinutes} min${commute.bestOriginLabel ? ` to ${commute.bestOriginLabel}` : ""}${
    commute.bestDistanceMiles !== null ? ` · ${commute.bestDistanceMiles} mi` : ""
  }`;
}

function priorityWeight(priorities: string[], label: string) {
  return priorities.includes(label) ? 3 : 2;
}

function compareListingScore(
  item: BoardListingRecord,
  priorities: BoardPageData["profile"]["priorities"],
  commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined,
) {
  let score = 0;
  const listing = item.listing;

  if (listing.price !== null) {
    score += (listing.price <= 2500 ? 3 : listing.price <= 4000 ? 2 : 1) * priorityWeight(priorities, "price");
  }

  if (listing.squareFeet !== null) {
    score += (listing.squareFeet >= 850 ? 3 : listing.squareFeet >= 650 ? 2 : 1) * priorityWeight(priorities, "space");
  } else if (listing.bedrooms !== null) {
    score += listing.bedrooms * priorityWeight(priorities, "space");
  }

  if (listing.amenities.length > 0) {
    score += Math.min(3, listing.amenities.length) * priorityWeight(priorities, "amenities");
  }

  if (commute?.bestDurationMinutes !== null && commute?.bestDurationMinutes !== undefined) {
    const commuteBand = commute.bestDurationMinutes <= 25 ? 3 : commute.bestDurationMinutes <= 40 ? 2 : 1;
    score += commuteBand * priorityWeight(priorities, "commute");
  }

  if (item.userStatus === "interested") score += 4;
  if (item.userStatus === "toured") score += 5;
  if (item.aiRedFlags.length > 0) score -= item.aiRedFlags.length * 2;

  return score;
}

function buildCompareSummary(selectedListings: BoardListingRecord[], data: BoardPageData) {
  if (selectedListings.length === 0) return null;

  const scored = selectedListings.map((item) => ({
    item,
    commute: data.boardListingCommutesByBoardListingId[item.id],
    score: compareListingScore(item, data.profile.priorities, data.boardListingCommutesByBoardListingId[item.id]),
  }));

  const practical = [...scored].sort((left, right) => {
    const leftPrice = left.item.listing.price ?? Number.MAX_SAFE_INTEGER;
    const rightPrice = right.item.listing.price ?? Number.MAX_SAFE_INTEGER;
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;
    return right.score - left.score;
  })[0]?.item ?? null;

  const lifestyle = [...scored].sort((left, right) => {
    const leftSignal = (left.item.listing.amenities.length * 2) + (left.item.listing.squareFeet ?? 0) / 300;
    const rightSignal = (right.item.listing.amenities.length * 2) + (right.item.listing.squareFeet ?? 0) / 300;
    return rightSignal - leftSignal;
  })[0]?.item ?? null;

  const commuteWinner = [...scored]
    .filter((entry) => entry.commute?.bestDurationMinutes !== null && entry.commute?.bestDurationMinutes !== undefined)
    .sort((left, right) => (left.commute?.bestDurationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.commute?.bestDurationMinutes ?? Number.MAX_SAFE_INTEGER))[0]
    ?.item ?? null;

  const risky = [...scored].sort((left, right) => {
    const leftRisk = left.item.aiRedFlags.length + (left.item.listing.price === null ? 2 : 0) + (left.item.listing.squareFeet === null ? 1 : 0);
    const rightRisk = right.item.aiRedFlags.length + (right.item.listing.price === null ? 2 : 0) + (right.item.listing.squareFeet === null ? 1 : 0);
    return rightRisk - leftRisk;
  })[0]?.item ?? null;

  const summaryParts: string[] = [];

  if (practical) {
    summaryParts.push(
      `${compareLocationLabel(practical)} looks like the strongest practical option right now because it keeps the board closest to a stable baseline on price, saved status, and overall completeness.`,
    );
  }

  if (commuteWinner) {
    summaryParts.push(
      `${compareLocationLabel(commuteWinner)} currently has the cleanest group commute read at ${formatCommuteSnippet(
        data.boardListingCommutesByBoardListingId[commuteWinner.id],
      )}.`,
    );
  }

  if (lifestyle && lifestyle.id !== practical?.id) {
    summaryParts.push(
      `${compareLocationLabel(lifestyle)} reads more like the lifestyle-forward pick, especially if space or amenities end up mattering more than the cleanest budget case.`,
    );
  }

  if (risky) {
    const riskReason =
      risky.aiRedFlags.length > 0
        ? `The main concern is ${risky.aiRedFlags[0].toLowerCase()}.`
        : "The main concern is that too much of the important detail is still missing.";
    summaryParts.push(`${compareLocationLabel(risky)} is the riskiest option in this set. ${riskReason}`);
  }

  const topPriority = data.profile.priorities[0];

  if (topPriority) {
    summaryParts.push(
      `Since the board is currently leaning hardest on ${topPriority}, the best choice should probably be the listing that survives that pressure without creating too many unknowns for the rest of the group.`,
    );
  }

  return {
    practical,
    lifestyle,
    commuteWinner,
    risky,
    narrative: summaryParts.join(" "),
  };
}

export function BoardExperience({ currentUser, data, recentBoards }: BoardExperienceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeckOpen, setIsDeckOpen] = useState(false);
  const [currentDeckIndex, setCurrentDeckIndex] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [chatInput, setChatInput] = useState("");
  const [listingMethod, setListingMethod] = useState<(typeof LISTING_METHODS)[number]>("pasted_link");
  const [shortlistStatusFilter, setShortlistStatusFilter] = useState<(typeof SHORTLIST_STATUS_OPTIONS)[number]>("all");
  const [voteFilter, setVoteFilter] = useState<"all" | (typeof VOTE_ORDER)[number]>("all");
  const [sortMode, setSortMode] = useState<(typeof SORT_OPTIONS)[number]>("updated");
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [focusedListingId, setFocusedListingId] = useState<string | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const readyForDeck = data.missingFields.length === 0;
  const shortlistItems = useMemo(() => {
    const filtered = data.boardListings
      .filter((item) => item.userStatus !== "rejected")
      .filter((item) => (shortlistStatusFilter === "all" ? true : item.userStatus === shortlistStatusFilter))
      .filter((item) => {
        if (voteFilter === "all") return true;
        const votes = data.listingVotesByBoardListingId[item.id] ?? [];
        return votes.some((vote) => vote.vote === voteFilter);
      });

    return [...filtered].sort((left, right) => {
      if (sortMode === "price-asc") return (left.listing.price ?? Number.MAX_SAFE_INTEGER) - (right.listing.price ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === "price-desc") return (right.listing.price ?? -1) - (left.listing.price ?? -1);
      if (sortMode === "bedrooms-desc") return (right.listing.bedrooms ?? -1) - (left.listing.bedrooms ?? -1);
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [data.boardListings, data.listingVotesByBoardListingId, shortlistStatusFilter, sortMode, voteFilter]);
  const deckListings = data.currentDeckListings.length > 0 ? data.currentDeckListings : data.suggestedListings;
  const currentSuggestion = deckListings[currentDeckIndex] ?? null;
  const isDemoMode = data.isDemoMode;
  const currentRoommateId = data.roommates.find((roommate) => roommate.linkedUserId === currentUser?.id)?.id ?? data.roommates[0]?.id ?? "";
  const shortlistCountLabel = shortlistItems.length === 1 ? "1 active listing" : `${shortlistItems.length} active listings`;
  const selectedListings = shortlistItems.filter((item) => selectedListingIds.includes(item.id)).slice(0, 3);
  const focusedListing = shortlistItems.find((item) => item.id === focusedListingId) ?? null;
  const compareSummary = useMemo(() => buildCompareSummary(selectedListings, data), [selectedListings, data]);

  const shouldOpenDeckFromConversation = useMemo(() => {
    const latestUser = [...data.messages].reverse().find((message) => message.role === "user");
    const latestAssistant = [...data.messages].reverse().find((message) => message.role === "assistant");
    const assistantTriggeredDeck =
      latestAssistant
        ? /staged .*demo batch|open the match deck|curated listings right away|lined up the strongest starting options/i.test(latestAssistant.content)
        : false;
    if (!latestUser) return false;
    return (
      assistantTriggeredDeck ||
      matchesDirectNycDemoRequest(latestUser.content) ||
      /\b(more|another|next)\b/i.test(latestUser.content) ||
      (/show|see|browse|open|give/i.test(latestUser.content) &&
        /listing|match|option|place|property|apartment|rental|home/i.test(latestUser.content))
    );
  }, [data.messages]);

  useEffect(() => {
    if (shouldOpenDeckFromConversation && deckListings.length > 0) {
      setIsDeckOpen(true);
      setCurrentDeckIndex(0);
    }
  }, [shouldOpenDeckFromConversation, deckListings.length]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("rental-advisor-theme");
    const nextTheme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    const collapsed = window.localStorage.getItem("rental-advisor-sidebar-collapsed");
    if (collapsed === "true") setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (!isDeckOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDeckOpen(false);
      if (event.key === "ArrowRight") setCurrentDeckIndex((index) => (index + 1 < deckListings.length ? index + 1 : index));
      if (event.key === "ArrowLeft") setCurrentDeckIndex((index) => Math.max(0, index - 1));
      if (event.key.toLowerCase() === "j") saveSuggestion("interested");
      if (event.key.toLowerCase() === "m") saveSuggestion("maybe");
      if (event.key.toLowerCase() === "x") saveSuggestion("rejected");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDeckOpen, deckListings.length, currentSuggestion]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    if (isDeckOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [isDeckOpen]);

  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [data.messages]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("rental-advisor-theme", next);
  }

  function toggleSidebar() {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    window.localStorage.setItem("rental-advisor-sidebar-collapsed", String(next));
  }

  async function submitChat() {
    if (!chatInput.trim()) return;

    const wantsDeck =
      matchesDirectNycDemoRequest(chatInput) ||
      /\b(more|another|next)\b/i.test(chatInput) ||
      (/show|see|browse|open|give/i.test(chatInput) &&
        /listing|match|option|place|property|apartment|rental|home/i.test(chatInput));
    const formData = new FormData();
    formData.set("boardId", data.board.id);
    formData.set("content", chatInput);

    startTransition(async () => {
      await sendChatAction(formData);
      setChatInput("");
      if (wantsDeck) setIsDeckOpen(true);
      router.refresh();
    });
  }

  function handleChatKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitChat();
      return;
    }

    if (event.key === " " && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitChat();
    }
  }

  function saveSuggestion(status: "interested" | "maybe" | "rejected") {
    if (!currentSuggestion) return;

    const formData = new FormData();
    formData.set("boardId", data.board.id);
    formData.set("listingId", currentSuggestion.listing.id);
    formData.set("status", status);

    startTransition(async () => {
      await saveSuggestedListingAction(formData);
      setCurrentDeckIndex((index) => Math.min(index + 1, Math.max(0, deckListings.length - 1)));
      router.refresh();
    });
  }

  function toggleListingSelection(boardListingId: string) {
    setSelectedListingIds((current) =>
      current.includes(boardListingId) ? current.filter((id) => id !== boardListingId) : [...current, boardListingId].slice(-3),
    );
  }

  return (
    <main className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar mac-sidebar">
        <div className="sidebar-toolbar">
          <button type="button" className="icon-button" onClick={toggleSidebar} aria-label="Toggle sidebar">
            {isSidebarCollapsed ? "›" : "‹"}
          </button>
          <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "◐" : "◑"}
          </button>
          <Link href="/settings" className="icon-button" aria-label="Open settings">
            ⚙
          </Link>
        </div>

        <div className="sidebar-brand sidebar-account">
          <span className="brand-dot" />
          {!isSidebarCollapsed ? (
            <div className="sidebar-account-copy">
              <strong>{currentUser?.displayName ?? "Homeboard"}</strong>
              <p>{currentUser?.workAddress ?? "No commute anchor yet"}</p>
            </div>
          ) : null}
        </div>

        <div className="sidebar-section">
          {!isSidebarCollapsed ? <div className="sidebar-label">Boards</div> : null}
          <div className="sidebar-board-list">
            <Link href="/" className="sidebar-board-link muted-link">
              <span>{isSidebarCollapsed ? "+" : "New board"}</span>
              {!isSidebarCollapsed ? <small>start</small> : null}
            </Link>
            {recentBoards.map((board) => (
              <div key={board.id} className="sidebar-board-row">
                <Link
                  href={`/boards/${board.id}`}
                  className={`sidebar-board-link ${board.id === data.board.id ? "active" : ""}`}
                  title={board.title}
                >
                  {isSidebarCollapsed ? (
                    <span>{formatBoardTitle(board.title).slice(0, 1).toUpperCase()}</span>
                  ) : (
                    <>
                      <span className="sidebar-board-title">{formatBoardTitle(board.title)}</span>
                      <small className="sidebar-board-date">{new Date(board.updatedAt).toLocaleDateString()}</small>
                    </>
                  )}
                </Link>
                {!isSidebarCollapsed ? (
                  <details className="overflow-menu">
                    <summary className="overflow-trigger" aria-label={`More actions for ${board.title}`}>
                      ...
                    </summary>
                    <div className="overflow-panel">
                      <form action={deleteBoardAction}>
                        <input type="hidden" name="boardId" value={board.id} />
                        <input type="hidden" name="redirectTo" value="/" />
                        <button type="submit" className="sidebar-delete-button" aria-label={`Delete ${board.title}`}>
                          Delete chat
                        </button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="board-stage">
        <div className="chat-stage">
          <div className="chat-thread-modern" ref={chatThreadRef}>
            {data.messages.map((message) => (
              <article key={message.id} className={`modern-message ${message.role}`}>
                {message.role === "assistant" ? <div className="avatar">A</div> : null}
                <div className="message-body">
                  <span className="message-role">{message.role === "assistant" ? "Advisor" : message.authorName ?? "Board member"}</span>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="chat-input-shell">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleChatKeyDown}
              rows={4}
              placeholder="Tell Homeboard about your move, budget, commute, group, neighborhoods, or ask to browse matches."
            />
            <div className="chat-input-footer">
              <div className="chat-hints">
                <span>
                  {data.missingFields.length > 0
                    ? `Profile ${data.completion.percentComplete}% complete · still collecting: ${data.missingFields.join(", ")}`
                    : "Onboarding looks complete. You can keep refining the brief here or confirm it in settings."}
                </span>
                <span>Manual edits live in settings.</span>
                <span>Enter sends · Shift+Enter newline · Ctrl/Cmd+Space sends</span>
              </div>
              <button type="button" onClick={submitChat} disabled={isPending}>
                {isPending ? "Updating..." : "Send"}
              </button>
            </div>

            {readyForDeck ? (
              <div className="chat-ready-card">
                <div>
                  <strong>Your profile is structured enough to browse matches.</strong>
                  <p>Keep onboarding in chat, or open the listing deck when you want to see options against the current profile.</p>
                </div>
                <div className="stage-actions">
                  <Link href={`/settings?boardId=${data.board.id}`} className="secondary-button">
                    Open settings
                  </Link>
                  <button type="button" className="primary-sidebar-button" onClick={() => setIsDeckOpen(true)}>
                    {data.currentBrowseRequest ? `Open ${data.currentBrowseRequest.count}-match batch` : "Open match deck"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isDeckOpen ? (
        <MatchDeck
          currentIndex={currentDeckIndex}
          currentSuggestion={currentSuggestion}
          total={deckListings.length}
          batchLabel={
            data.currentBrowseRequest
              ? data.currentBrowseRequest.isMoreRequest
                ? `Another ${data.currentBrowseRequest.count} fresh matches`
                : `${data.currentBrowseRequest.count} fresh matches`
              : "Current match batch"
          }
          onClose={() => setIsDeckOpen(false)}
          onNext={() => setCurrentDeckIndex((index) => (index + 1 < deckListings.length ? index + 1 : index))}
          onPrev={() => setCurrentDeckIndex((index) => Math.max(0, index - 1))}
          onSave={saveSuggestion}
          isPending={isPending}
        />
      ) : null}

      {focusedListing ? (
        <ListingDetailModal
          boardListing={focusedListing}
          commute={data.boardListingCommutesByBoardListingId[focusedListing.id]}
          votes={data.listingVotesByBoardListingId[focusedListing.id] ?? []}
          comments={data.listingCommentsByBoardListingId[focusedListing.id] ?? []}
          onClose={() => setFocusedListingId(null)}
        />
      ) : null}
    </main>
  );
}

function VoteSummary({ votes }: { votes: BoardListingVoteRecord[] }) {
  if (votes.length === 0) {
    return <p className="mini-meta">No roommate reactions yet.</p>;
  }

  const counts = VOTE_ORDER.map((vote) => ({
    vote,
    count: votes.filter((entry) => entry.vote === vote).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="vote-summary">
      {counts.map((entry) => (
        <span key={entry.vote}>
          {entry.vote}: {entry.count}
        </span>
      ))}
    </div>
  );
}

function CommentFeed({ comments }: { comments: BoardListingCommentRecord[] }) {
  if (comments.length === 0) {
    return <p className="mini-meta">No notes yet.</p>;
  }

  return (
    <div className="comment-feed">
      {comments.slice(0, 3).map((comment) => (
        <article key={comment.id} className="comment-item">
          <strong>{comment.roommate.name}</strong>
          <p>{comment.content}</p>
        </article>
      ))}
    </div>
  );
}

function ListingDetailModal({
  boardListing,
  commute,
  votes,
  comments,
  onClose,
}: {
  boardListing: BoardListingRecord;
  commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined;
  votes: BoardListingVoteRecord[];
  comments: BoardListingCommentRecord[];
  onClose: () => void;
}) {
  const listing = boardListing.listing;
  const headline = [listing.neighborhood, listing.city].filter(Boolean).join(", ") || listing.address || "Untitled listing";
  const feeEntries = Object.entries(listing.fees ?? {}).filter(([, value]) => value !== null && value !== "");

  return (
    <div className="deck-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-modal-head">
          <div>
            <span className="deck-counter">{boardListing.userStatus}</span>
            <h2>{headline}</h2>
            <p>{listing.address ?? "Address still missing"}</p>
          </div>
          <button type="button" className="deck-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="detail-modal-grid">
          <div className="detail-panel">
            <strong>Snapshot</strong>
            <div className="compare-stat-list">
              <span>Price: {listing.price ? `$${listing.price.toLocaleString()}` : "unknown"}</span>
              <span>Bedrooms: {listing.bedrooms !== null ? listing.bedrooms : "unknown"}</span>
              <span>Bathrooms: {listing.bathrooms !== null ? listing.bathrooms : "unknown"}</span>
              <span>Square feet: {listing.squareFeet !== null ? listing.squareFeet : "unknown"}</span>
              <span>Commute: {formatCommuteSnippet(commute)}</span>
              <span>Source: {listing.source}</span>
              <span>Status: {listing.status}</span>
            </div>
            {listing.sourceUrl ? (
              <a href={listing.sourceUrl} target="_blank" rel="noreferrer">
                Open original source
              </a>
            ) : null}
          </div>

          <div className="detail-panel">
            <strong>Tradeoff read</strong>
            <p>{boardListing.aiTradeoffAnalysis ?? boardListing.aiSummary ?? "No saved analysis yet."}</p>
            {boardListing.aiRedFlags.length > 0 ? (
              <div className="detail-chip-wrap">
                {boardListing.aiRedFlags.map((flag) => (
                  <span key={flag} className="saved-pill">{flag}</span>
                ))}
              </div>
            ) : null}
            {boardListing.questionsToAsk.length > 0 ? (
              <>
                <strong>Questions to ask</strong>
                <ul className="detail-list">
                  {boardListing.questionsToAsk.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="detail-panel">
            <strong>Amenities</strong>
            {listing.amenities.length > 0 ? (
              <div className="detail-chip-wrap">
                {listing.amenities.map((amenity) => (
                  <span key={amenity} className="saved-pill">{amenity}</span>
                ))}
              </div>
            ) : (
              <p>No amenities saved yet.</p>
            )}
            <strong>Fees and unknowns</strong>
            {feeEntries.length > 0 ? (
              <ul className="detail-list">
                {feeEntries.map(([key, value]) => (
                  <li key={key}>{key}: {String(value)}</li>
                ))}
              </ul>
            ) : (
              <p>Fees are still mostly unknown.</p>
            )}
          </div>

          <div className="detail-panel">
            <strong>Roommate reactions</strong>
            <VoteSummary votes={votes} />
            <CommentFeed comments={comments} />
            <strong>Listing note</strong>
            <p>{listing.description ?? "No description saved yet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type MatchDeckProps = {
  currentIndex: number;
  currentSuggestion: SuggestedListingRecord | null;
  total: number;
  batchLabel: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: (status: "interested" | "maybe" | "rejected") => void;
  isPending: boolean;
};

function MatchDeck({ currentIndex, currentSuggestion, total, batchLabel, onClose, onNext, onPrev, onSave, isPending }: MatchDeckProps) {
  if (!currentSuggestion) {
    return (
      <div className="deck-overlay" onClick={onClose}>
        <div className="deck-empty">
          <h2>No matched listings yet</h2>
          <p>Try giving me a location, budget, and bedroom preference, then ask for something like “show me 5 listings.”</p>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const listing = currentSuggestion.listing;
  const headline = [listing.neighborhood, listing.city].filter(Boolean).join(", ") || "Untitled listing";

  return (
    <div className="deck-overlay" onClick={onClose}>
      <div className="deck-shell" onClick={(event) => event.stopPropagation()}>
        <div className="deck-topbar">
          <div>
            <span className="deck-counter">
              {currentIndex + 1} / {total}
            </span>
            <p className="deck-batch-label">{batchLabel}</p>
            <h2>{headline}</h2>
          </div>
          <button type="button" className="deck-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="deck-card">
          <div className="deck-visual">
            {listing.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.images[0]} alt={headline} />
            ) : (
              <div className="deck-placeholder">No image in the dummy listing</div>
            )}
          </div>

          <div className="deck-content">
            <div className="deck-pill-row">
              <span className="fit-pill">{currentSuggestion.fitLabel}</span>
              {currentSuggestion.existingStatus ? <span className="saved-pill">already {currentSuggestion.existingStatus}</span> : null}
            </div>

            <div className="deck-price">
              {listing.price ? `$${listing.price.toLocaleString()}` : "Price unknown"}
              <span>
                {listing.bedrooms !== null ? `${listing.bedrooms} bed` : "bed unknown"}
                {listing.bathrooms !== null ? ` · ${listing.bathrooms} bath` : ""}
                {listing.squareFeet !== null ? ` · ${listing.squareFeet} sq ft` : ""}
              </span>
            </div>

            <p className="deck-reason">{currentSuggestion.fitReason}</p>
            <p className="deck-tradeoff">{currentSuggestion.tradeoffSummary}</p>

            <div className="deck-meta">
              <span>Source: {listing.source}</span>
              <span>Status: {listing.status}</span>
              {currentSuggestion.commute && currentSuggestion.commute.bestDurationMinutes !== null ? (
                <span>
                  Commute: {currentSuggestion.commute.bestDurationMinutes} min
                  {currentSuggestion.commute.bestOriginLabel ? ` to ${currentSuggestion.commute.bestOriginLabel}` : ""}
                  {currentSuggestion.commute.bestDistanceMiles !== null ? ` · ${currentSuggestion.commute.bestDistanceMiles} mi` : ""}
                </span>
              ) : null}
              {listing.sourceUrl ? (
                <a href={listing.sourceUrl} target="_blank" rel="noreferrer">
                  Source link
                </a>
              ) : null}
            </div>

            {currentSuggestion.neighborhoodSignal ? (
              <div className="deck-description">
                <strong>Neighborhood read</strong>
                <p>{currentSuggestion.neighborhoodSignal.summary}</p>
                <div className="starter-pills">
                  {currentSuggestion.neighborhoodSignal.tags.map((tag) => (
                    <span key={tag} className="saved-pill">{tag}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="deck-description">
              <strong>Listing note</strong>
              <p>{listing.description ?? "No description saved yet."}</p>
            </div>

            <div className="deck-actions">
              <button type="button" className="deck-reject" onClick={() => onSave("rejected")} disabled={isPending}>
                Pass <span className="shortcut-hint">X</span>
              </button>
              <button type="button" className="deck-maybe" onClick={() => onSave("maybe")} disabled={isPending}>
                Save for later <span className="shortcut-hint">M</span>
              </button>
              <button type="button" className="deck-like" onClick={() => onSave("interested")} disabled={isPending}>
                Like <span className="shortcut-hint">J</span>
              </button>
            </div>

            <div className="deck-nav">
              <button type="button" onClick={onPrev} disabled={currentIndex === 0}>
                Previous <span className="shortcut-hint">←</span>
              </button>
              <button type="button" onClick={onNext} disabled={currentIndex + 1 >= total}>
                Next <span className="shortcut-hint">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
