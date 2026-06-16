"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  addListingCommentAction,
  addListingAction,
  createBoardInvitationAction,
  deleteBoardAction,
  saveSuggestedListingAction,
  saveListingVoteAction,
  sendChatAction,
  updateListingStatusAction,
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

function priorityWeight(level: "low" | "medium" | "high") {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function compareListingScore(
  item: BoardListingRecord,
  priorities: BoardPageData["profile"]["priorities"],
  commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined,
) {
  let score = 0;
  const listing = item.listing;

  if (listing.price !== null) {
    score += (listing.price <= 2500 ? 3 : listing.price <= 4000 ? 2 : 1) * priorityWeight(priorities.price);
  }

  if (listing.squareFeet !== null) {
    score += (listing.squareFeet >= 850 ? 3 : listing.squareFeet >= 650 ? 2 : 1) * priorityWeight(priorities.space);
  } else if (listing.bedrooms !== null) {
    score += listing.bedrooms * priorityWeight(priorities.space);
  }

  if (listing.amenities.length > 0) {
    score += Math.min(3, listing.amenities.length) * priorityWeight(priorities.amenities);
  }

  if (commute?.bestDurationMinutes !== null && commute?.bestDurationMinutes !== undefined) {
    const commuteBand = commute.bestDurationMinutes <= 25 ? 3 : commute.bestDurationMinutes <= 40 ? 2 : 1;
    score += commuteBand * priorityWeight(priorities.commute);
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

  const topPriority = Object.entries(data.profile.priorities)
    .sort((left, right) => priorityWeight(right[1]) - priorityWeight(left[1]))[0]?.[0];

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
        <header className="stage-header">
          <div>
            <div className="home-badge">Shared board</div>
            <h1>
              {isDemoMode
                ? "Use the chat to set the brief, then use the match deck and shortlist to make the call."
                : "Use the shared chat to shape the group limits, then use the board to make the tradeoffs visible."}
            </h1>
          </div>
          <div className="stage-actions">
            <button type="button" className="secondary-button" onClick={() => setIsDeckOpen(true)} disabled={deckListings.length === 0}>
              Browse {deckListings.length} matches
            </button>
            <details className="overflow-menu stage-overflow-menu">
              <summary className="overflow-trigger" aria-label="More board actions">
                ...
              </summary>
              <div className="overflow-panel">
                <form action={deleteBoardAction}>
                  <input type="hidden" name="boardId" value={data.board.id} />
                  <input type="hidden" name="redirectTo" value="/" />
                  <button type="submit" className="sidebar-delete-button">Delete chat</button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <div className="chat-stage">
          <div className="chat-thread-modern">
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
              placeholder="Try: 3000 max, only Jersey City now, 2 bed, August, laundry has to be in building, and show me some listings."
            />
            <div className="chat-input-footer">
              <div className="chat-hints">
                {data.missingFields.length > 0
                  ? data.missingFields.map((field) => <span key={field}>Still need: {field}</span>)
                  : <span>Core search profile is filled.</span>}
                <span>Try: show me 5 · give me more · show me 20 more</span>
                <span>Enter sends · Shift+Enter newline · Ctrl/Cmd+Space sends</span>
              </div>
              <button type="button" onClick={submitChat} disabled={isPending}>
                {isPending ? "Updating..." : "Send"}
              </button>
            </div>

            {readyForDeck ? (
              <div className="chat-ready-card">
                <div>
                  <strong>Your search is filled in enough to browse real matches.</strong>
                  <p>Keep changing fields in chat if you want, or open the deck and start swiping through the dummy inventory.</p>
                </div>
                <button type="button" className="primary-sidebar-button" onClick={() => setIsDeckOpen(true)}>
                  {data.currentBrowseRequest ? `Open ${data.currentBrowseRequest.count}-match batch` : "Open match deck"}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <section className="bottom-rail">
          {isDemoMode ? (
            <div className="rail-card rail-card-wide">
              <div className="rail-card-header">
                <h2>Saved shortlist</h2>
                <span>{shortlistCountLabel}</span>
              </div>
              <div className="compare-banner">
                <div>
                  <strong>Keep the demo focused on contenders.</strong>
                  <p>Use the deck to save options, then trim and compare them here without the extra dashboard clutter.</p>
                </div>
                <div className="compare-banner-actions">
                  <span>{selectedListings.length} selected</span>
                  <button type="button" className="secondary-button" onClick={() => setSelectedListingIds([])} disabled={selectedListings.length === 0}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="board-tool-controls demo-shortlist-controls">
                <label className="field-stack compact-field">
                  <span>Status</span>
                  <select value={shortlistStatusFilter} onChange={(event) => setShortlistStatusFilter(event.target.value as (typeof SHORTLIST_STATUS_OPTIONS)[number])}>
                    {SHORTLIST_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-stack compact-field">
                  <span>Vote</span>
                  <select value={voteFilter} onChange={(event) => setVoteFilter(event.target.value as "all" | (typeof VOTE_ORDER)[number])}>
                    <option value="all">all</option>
                    {VOTE_ORDER.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-stack compact-field">
                  <span>Sort</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as (typeof SORT_OPTIONS)[number])}>
                    <option value="updated">recently updated</option>
                    <option value="price-asc">price low to high</option>
                    <option value="price-desc">price high to low</option>
                    <option value="bedrooms-desc">most bedrooms</option>
                  </select>
                </label>
              </div>
              {compareSummary ? (
                <div className="compare-summary-card">
                  <div className="compare-summary-pills">
                    {compareSummary.practical ? <span className="saved-pill">strongest practical option: {compareLocationLabel(compareSummary.practical)}</span> : null}
                    {compareSummary.lifestyle ? <span className="saved-pill">best lifestyle option: {compareLocationLabel(compareSummary.lifestyle)}</span> : null}
                    {compareSummary.commuteWinner ? <span className="saved-pill">best commute option: {compareLocationLabel(compareSummary.commuteWinner)}</span> : null}
                    {compareSummary.risky ? <span className="saved-pill">riskiest option: {compareLocationLabel(compareSummary.risky)}</span> : null}
                  </div>
                  <p>{compareSummary.narrative}</p>
                </div>
              ) : null}
              <div className="shortlist-grid">
                {shortlistItems.length === 0 ? (
                  <article className="shortlist-card shortlist-empty">
                    <strong>No active shortlist yet</strong>
                    <p>Save a few listings from the deck and they will show up here. Rejected ones stay off the shortlist.</p>
                  </article>
                ) : null}

                {shortlistItems.slice(0, 12).map((item) => (
                  <article key={item.id} className="shortlist-card">
                    <div>
                      <strong>{[item.listing.neighborhood, item.listing.city].filter(Boolean).join(", ") || "Untitled listing"}</strong>
                      <p>
                        {item.listing.price ? `$${item.listing.price.toLocaleString()}` : "Price unknown"}
                        {item.listing.bedrooms !== null ? ` · ${item.listing.bedrooms} bed` : ""}
                      </p>
                    </div>
                    <div className="shortlist-actions-row">
                      <label className="select-for-compare">
                        <input
                          type="checkbox"
                          checked={selectedListingIds.includes(item.id)}
                          onChange={() => toggleListingSelection(item.id)}
                        />
                        <span>compare</span>
                      </label>
                      <button type="button" className="ghost-button" onClick={() => setFocusedListingId(item.id)}>
                        View details
                      </button>
                    </div>
                    <form
                      action={async (formData) => {
                        startTransition(async () => {
                          await updateListingStatusAction(formData);
                          router.refresh();
                        });
                      }}
                      className="shortlist-status-form"
                    >
                      <input type="hidden" name="boardId" value={data.board.id} />
                      <input type="hidden" name="boardListingId" value={item.id} />
                      <select name="status" defaultValue={item.userStatus}>
                        <option value="new">new</option>
                        <option value="interested">interested</option>
                        <option value="maybe">maybe</option>
                        <option value="rejected">rejected</option>
                        <option value="toured">toured</option>
                        <option value="applied">applied</option>
                      </select>
                      <button type="submit">Save</button>
                    </form>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <>
          <div className="rail-card">
            <div className="rail-card-header">
              <h2>Board tools</h2>
              <span>{shortlistCountLabel}</span>
            </div>
            <div className="board-tools-grid">
              <div className="board-tool-block">
                <strong>Shortlist controls</strong>
                <div className="board-tool-controls">
                  <label className="field-stack compact-field">
                    <span>Status</span>
                    <select value={shortlistStatusFilter} onChange={(event) => setShortlistStatusFilter(event.target.value as (typeof SHORTLIST_STATUS_OPTIONS)[number])}>
                      {SHORTLIST_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-stack compact-field">
                    <span>Vote</span>
                    <select value={voteFilter} onChange={(event) => setVoteFilter(event.target.value as "all" | (typeof VOTE_ORDER)[number])}>
                      <option value="all">all</option>
                      {VOTE_ORDER.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-stack compact-field">
                    <span>Sort</span>
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value as (typeof SORT_OPTIONS)[number])}>
                      <option value="updated">recently updated</option>
                      <option value="price-asc">price low to high</option>
                      <option value="price-desc">price high to low</option>
                      <option value="bedrooms-desc">most bedrooms</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="board-tool-block">
                <strong>Add a listing</strong>
                <p className="mini-meta">Use the board directly when you already have a link, pasted text, or a manual comp to compare.</p>
                <div className="listing-method-tabs">
                  <button type="button" className={listingMethod === "pasted_link" ? "active" : ""} onClick={() => setListingMethod("pasted_link")}>
                    Link
                  </button>
                  <button type="button" className={listingMethod === "pasted_text" ? "active" : ""} onClick={() => setListingMethod("pasted_text")}>
                    Pasted text
                  </button>
                  <button type="button" className={listingMethod === "manual" ? "active" : ""} onClick={() => setListingMethod("manual")}>
                    Manual
                  </button>
                </div>
                <form
                  action={async (formData) => {
                    startTransition(async () => {
                      await addListingAction(formData);
                      router.refresh();
                    });
                  }}
                  className="listing-intake-form"
                >
                  <input type="hidden" name="boardId" value={data.board.id} />
                  <input type="hidden" name="method" value={listingMethod} />

                  {listingMethod === "pasted_link" ? (
                    <>
                      <input name="sourceUrl" placeholder="Paste a listing URL to keep it on the board" />
                      <textarea name="description" rows={3} placeholder="Optional context, like why this one caught your eye." />
                    </>
                  ) : null}

                  {listingMethod === "pasted_text" ? (
                    <textarea
                      name="pastedText"
                      rows={6}
                      placeholder="Paste the listing description here. The board will pull out whatever details it can."
                    />
                  ) : null}

                  {listingMethod === "manual" ? (
                    <div className="listing-intake-manual-grid">
                      <input name="address" placeholder="Address" />
                      <input name="city" placeholder="City" />
                      <input name="neighborhood" placeholder="Neighborhood" />
                      <input name="price" placeholder="Price" inputMode="numeric" />
                      <input name="bedrooms" placeholder="Bedrooms" inputMode="decimal" />
                      <input name="bathrooms" placeholder="Bathrooms" inputMode="decimal" />
                      <input name="squareFeet" placeholder="Square feet" inputMode="numeric" />
                      <textarea name="description" rows={4} placeholder="Anything useful the group should know about this listing." />
                    </div>
                  ) : null}

                  <button type="submit" className="roommate-add-button" disabled={isPending}>
                    {isPending ? "Saving..." : "Add listing to board"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="rail-card">
            <div className="rail-card-header">
              <h2>Group read</h2>
              <span>{data.members.length} members</span>
            </div>
            <p>{data.groupSynthesis.summary}</p>
            <div className="synthesis-grid">
              <div className="synthesis-chip">
                <span>Shared cap</span>
                <strong>{data.groupSynthesis.groupBudgetMax ? `$${data.groupSynthesis.groupBudgetMax.toLocaleString()}` : "Still loose"}</strong>
              </div>
              <div className="synthesis-chip">
                <span>Compromise areas</span>
                <strong>{data.groupSynthesis.compromiseAreas.join(", ") || "Still emerging"}</strong>
              </div>
              <div className="synthesis-chip">
                <span>Top priorities</span>
                <strong>{data.groupSynthesis.topSharedPriorities.join(", ") || "Need more signal"}</strong>
              </div>
            </div>
            {data.groupSynthesis.tensionFlags.length > 0 ? (
              <div className="tension-list">
                {data.groupSynthesis.tensionFlags.map((flag) => (
                  <span key={flag}>{flag}</span>
                ))}
              </div>
            ) : null}
            <p>{data.comparison}</p>
          </div>

          <div className="rail-card">
            <div className="rail-card-header">
              <h2>Roommates</h2>
              <span>Shared board</span>
            </div>
            <div className="roommate-grid">
              <div className="roommate-list">
                {data.members.length === 0 ? (
                  <article className="shortlist-card shortlist-empty">
                    <strong>No collaborators on this board yet</strong>
                    <p>Invite people into the board and their real accounts will start showing up in the shared chat.</p>
                  </article>
                ) : null}

                {data.members.map((member) => {
                  const roommate = data.roommates.find((entry) => entry.linkedUserId === member.userId) ?? null;

                  return (
                    <article key={member.id} className="roommate-summary-card">
                      <div className="roommate-summary-head">
                        <strong>{member.user.displayName}</strong>
                        <span>{member.role === "owner" ? "board owner" : "member"}</span>
                      </div>
                      <div className="roommate-summary-meta">
                        <span>{roommate?.budgetMax ? `Budget $${roommate.budgetMax.toLocaleString()}` : "Budget still open"}</span>
                        <span>{member.user.workAddress ? member.user.workAddress : "No commute anchor yet"}</span>
                      </div>
                    </article>
                  );
                })}

                {data.invitations.map((invite) => (
                  <article key={invite.id} className="roommate-summary-card invite-summary-card">
                    <div className="roommate-summary-head">
                      <strong>{invite.email}</strong>
                      <span>pending invite</span>
                    </div>
                    <div className="roommate-summary-meta">
                      <span>Share this link with them</span>
                      <a href={`/invite/${invite.token}`}>/invite/{invite.token}</a>
                    </div>
                  </article>
                ))}
              </div>

              <article className="shortlist-card roommate-card roommate-add-card">
                <div className="roommate-add-head">
                  <strong>Invite collaborator</strong>
                  <p>Invite by email. Once they sign in, they can join the exact board instead of pretending to be a local profile.</p>
                </div>
                <form
                  action={async (formData) => {
                    startTransition(async () => {
                      await createBoardInvitationAction(formData);
                      router.refresh();
                    });
                  }}
                  className="roommate-form"
                >
                  <input type="hidden" name="boardId" value={data.board.id} />
                  <input name="email" type="email" placeholder="roommate@email.com" />
                  <button type="submit" className="roommate-add-button">Create invite link</button>
                </form>
              </article>
            </div>
          </div>

          <div className="rail-card rail-card-wide">
            <div className="rail-card-header">
              <h2>Saved shortlist</h2>
              <span>{shortlistCountLabel}</span>
            </div>
            <div className="compare-banner">
              <div>
                <strong>Compare up to 3 listings</strong>
                <p>Select contenders from the shortlist, then use the compare workspace below to pressure-test them side by side.</p>
              </div>
              <div className="compare-banner-actions">
                <span>{selectedListings.length} selected</span>
                <button type="button" className="secondary-button" onClick={() => setSelectedListingIds([])} disabled={selectedListings.length === 0}>
                  Clear
                </button>
              </div>
            </div>
            <div className="shortlist-grid">
              {shortlistItems.length === 0 ? (
                <article className="shortlist-card shortlist-empty">
                  <strong>No active shortlist yet</strong>
                  <p>Liked and maybe listings stay here. Rejected ones are kept off this shortlist, and the filters above can narrow the board further.</p>
                </article>
              ) : null}

              {shortlistItems.slice(0, 8).map((item) => (
                <article key={item.id} className="shortlist-card">
                  <div>
                    <strong>{[item.listing.neighborhood, item.listing.city].filter(Boolean).join(", ") || "Untitled listing"}</strong>
                    <p>
                      {item.listing.price ? `$${item.listing.price.toLocaleString()}` : "Price unknown"}
                      {item.listing.bedrooms !== null ? ` · ${item.listing.bedrooms} bed` : ""}
                    </p>
                  </div>
                  <div className="shortlist-actions-row">
                    <label className="select-for-compare">
                      <input
                        type="checkbox"
                        checked={selectedListingIds.includes(item.id)}
                        onChange={() => toggleListingSelection(item.id)}
                      />
                      <span>compare</span>
                    </label>
                    <button type="button" className="ghost-button" onClick={() => setFocusedListingId(item.id)}>
                      View details
                    </button>
                  </div>
                  <form
                    action={async (formData) => {
                      startTransition(async () => {
                        await updateListingStatusAction(formData);
                        router.refresh();
                      });
                    }}
                    className="shortlist-status-form"
                  >
                    <input type="hidden" name="boardId" value={data.board.id} />
                    <input type="hidden" name="boardListingId" value={item.id} />
                    <select name="status" defaultValue={item.userStatus}>
                      <option value="new">new</option>
                      <option value="interested">interested</option>
                      <option value="maybe">maybe</option>
                      <option value="rejected">rejected</option>
                      <option value="toured">toured</option>
                      <option value="applied">applied</option>
                    </select>
                    <button type="submit">Save</button>
                  </form>
                  <VoteSummary votes={data.listingVotesByBoardListingId[item.id] ?? []} />
                  <form
                    action={async (formData) => {
                      startTransition(async () => {
                        await saveListingVoteAction(formData);
                        router.refresh();
                      });
                    }}
                    className="vote-form"
                  >
                    <input type="hidden" name="boardId" value={data.board.id} />
                    <input type="hidden" name="boardListingId" value={item.id} />
                    <select name="roommateId" defaultValue={currentRoommateId} disabled={!currentRoommateId}>
                      {data.roommates.map((roommate) => (
                        <option key={roommate.id} value={roommate.id}>
                          {roommate.name}
                        </option>
                      ))}
                    </select>
                    <select name="vote" defaultValue="maybe">
                      <option value="love">love</option>
                      <option value="like">like</option>
                      <option value="maybe">maybe</option>
                      <option value="pass">pass</option>
                      <option value="veto">veto</option>
                    </select>
                    <button type="submit" disabled={!currentRoommateId}>Save vote</button>
                  </form>
                  <CommentFeed comments={data.listingCommentsByBoardListingId[item.id] ?? []} />
                  <form
                    action={async (formData) => {
                      startTransition(async () => {
                        await addListingCommentAction(formData);
                        router.refresh();
                      });
                    }}
                    className="comment-form"
                  >
                    <input type="hidden" name="boardId" value={data.board.id} />
                    <input type="hidden" name="boardListingId" value={item.id} />
                    <select name="roommateId" defaultValue={currentRoommateId} disabled={!currentRoommateId}>
                      {data.roommates.map((roommate) => (
                        <option key={roommate.id} value={roommate.id}>
                          {roommate.name}
                        </option>
                      ))}
                    </select>
                    <input name="content" placeholder="Leave a group note on this listing" />
                    <button type="submit" disabled={!currentRoommateId}>Comment</button>
                  </form>
                </article>
              ))}
            </div>
          </div>

          <div className="rail-card rail-card-wide">
            <div className="rail-card-header">
              <h2>Compare workspace</h2>
              <span>{selectedListings.length > 0 ? `${selectedListings.length} selected` : "Select listings to compare"}</span>
            </div>
            {selectedListings.length === 0 ? (
              <article className="shortlist-card shortlist-empty">
                <strong>No listings selected yet</strong>
                <p>Use the compare toggle on shortlist cards to line up contenders. This is where the group can pressure-test price, commute, space, and unknowns.</p>
              </article>
            ) : (
              <>
                {compareSummary ? (
                  <div className="compare-summary-card">
                    <div className="compare-summary-pills">
                      {compareSummary.practical ? <span className="saved-pill">strongest practical option: {compareLocationLabel(compareSummary.practical)}</span> : null}
                      {compareSummary.lifestyle ? <span className="saved-pill">best lifestyle option: {compareLocationLabel(compareSummary.lifestyle)}</span> : null}
                      {compareSummary.commuteWinner ? <span className="saved-pill">best commute option: {compareLocationLabel(compareSummary.commuteWinner)}</span> : null}
                      {compareSummary.risky ? <span className="saved-pill">riskiest option: {compareLocationLabel(compareSummary.risky)}</span> : null}
                    </div>
                    <p>{compareSummary.narrative}</p>
                  </div>
                ) : null}

                <div className="compare-grid">
                  {selectedListings.map((item) => (
                    <article key={item.id} className="compare-card">
                      <div className="compare-card-head">
                        <strong>{compareLocationLabel(item)}</strong>
                        <span>{item.userStatus}</span>
                      </div>
                      <div className="compare-stat-list">
                        <span>Price: {item.listing.price ? `$${item.listing.price.toLocaleString()}` : "unknown"}</span>
                        <span>Bedrooms: {item.listing.bedrooms !== null ? item.listing.bedrooms : "unknown"}</span>
                        <span>Bathrooms: {item.listing.bathrooms !== null ? item.listing.bathrooms : "unknown"}</span>
                        <span>Space: {item.listing.squareFeet !== null ? `${item.listing.squareFeet} sq ft` : "unknown"}</span>
                        <span>Commute: {formatCommuteSnippet(data.boardListingCommutesByBoardListingId[item.id])}</span>
                      </div>
                      <p>{item.aiTradeoffAnalysis ?? item.aiSummary ?? "No analysis saved yet."}</p>
                      {item.aiRedFlags.length > 0 ? (
                        <div className="detail-chip-wrap">
                          {item.aiRedFlags.map((flag) => (
                            <span key={flag} className="saved-pill">{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      <VoteSummary votes={data.listingVotesByBoardListingId[item.id] ?? []} />
                      <CommentFeed comments={data.listingCommentsByBoardListingId[item.id] ?? []} />
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rail-card rail-card-wide">
            <div className="rail-card-header">
              <h2>Shared activity</h2>
              <span>{data.activity.length} recent events</span>
            </div>
            <div className="activity-feed">
              {data.activity.length === 0 ? (
                <article className="activity-item">
                  <strong>No board activity yet</strong>
                  <p>As people chat, save listings, react, and comment, the shared trail will show up here.</p>
                </article>
              ) : null}

              {data.activity.map((event) => (
                <article key={event.id} className="activity-item">
                  <div className="roommate-summary-head">
                    <strong>{event.actorName}</strong>
                    <span>{formatTimestamp(event.createdAt)}</span>
                  </div>
                  <p>{event.content}</p>
                </article>
              ))}
            </div>
          </div>
            </>
          )}
        </section>
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
