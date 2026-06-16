"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteBoardAction } from "@/app/actions";
import type { AuthUserRecord, ChatMessage, ProfileCompletion, SearchProfileData } from "@/lib/types";

type HomeExperienceProps = {
  currentUser: AuthUserRecord;
  recentBoards: Array<{ id: string; title: string; updatedAt: string }>;
  isDemoEnabled: boolean;
};

const STORAGE_KEY = "homeboard-onboarding-draft-v1";

type DraftState = {
  profile: SearchProfileData;
  messages: ChatMessage[];
  completion: ProfileCompletion;
};

function createInitialDraft(currentUser: AuthUserRecord): DraftState {
  const now = new Date().toISOString();
  const profile: SearchProfileData = {
    id: "onboarding-draft",
    boardId: "onboarding-draft",
    name: currentUser.displayName || "Unknown",
    email: currentUser.email,
    city: undefined,
    moveInDate: undefined,
    budgetMin: undefined,
    budgetMax: undefined,
    stretchBudget: undefined,
    neighborhoods: [],
    commuteTarget: undefined,
    maxCommuteMinutes: undefined,
    mustHaves: [],
    dealbreakers: [],
    niceToHaves: [],
    priorities: [],
    pets: undefined,
    parking: undefined,
    groupSize: undefined,
    hasRoommates: undefined,
    rentalReadiness: {},
    completionStatus: "incomplete",
    notes: null,
    createdAt: now,
    updatedAt: now,
    intent: "rent",
    propertyType: "apartment",
    locations: [],
    bedroomsPreferred: null,
    bedroomsFlexible: [],
    moveInTimeframe: null,
    petsRequired: null,
    parkingRequired: null,
    laundryRequired: null,
  };

  return {
    profile,
    messages: [
      {
        id: "assistant-welcome",
        boardId: "onboarding-draft",
        role: "assistant",
        authorUserId: null,
        authorName: "Advisor",
        content:
          "Tell me about your move and I’ll build the rental profile before we create the board. Start with whatever comes naturally: city, roommates, budget, move-in timing, commute, or neighborhoods.",
        createdAt: now,
      },
    ],
    completion: {
      completedFields: ["name"],
      missingFields: ["city", "move-in timing", "budget", "commute or neighborhood", "must-haves", "dealbreakers", "priorities"],
      percentComplete: 13,
    },
  };
}

export function HomeExperience({ currentUser, recentBoards, isDemoEnabled }: HomeExperienceProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [chatInput, setChatInput] = useState("");
  const [showDemoStarter, setShowDemoStarter] = useState(isDemoEnabled);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => createInitialDraft(currentUser));

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

    const savedDraft = window.sessionStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as DraftState;
        setDraft(parsed);
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    if (window.sessionStorage.getItem("homeboard-demo-starter-dismissed") === "true") {
      setShowDemoStarter(false);
    }
  }, [currentUser]);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [draft.messages]);

  const profileSummary = useMemo(() => {
    const profile = draft.profile;
    return [
      profile.city || profile.locations[0] || "No city yet",
      profile.moveInDate || profile.moveInTimeframe || "No move-in date yet",
      profile.budgetMax ? `Up to $${profile.budgetMax.toLocaleString()}` : "No budget yet",
      profile.commuteTarget || profile.neighborhoods[0] || "No commute or neighborhood anchor yet",
    ];
  }, [draft.profile]);

  const completedCount = draft.completion.completedFields.length;
  const missingCount = draft.completion.missingFields.length;

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

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }

    if (event.key === " " && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function useDemoStarter() {
    setDraftError(null);
    setChatInput(
      "We’re three recent grads moving to NYC in August. Sam works in Midtown and wants the commute under 40 minutes. Maya wants a social Brooklyn neighborhood with natural light. Jordan needs train access and does not want anything over 1600. We’re trying to stay around 1400 to 1700 each, maybe 1800 max if the fit is great.",
    );
    setShowDemoStarter(false);
    window.sessionStorage.setItem("homeboard-demo-starter-dismissed", "true");
  }

  async function submitOnboardingMessage() {
    if (!chatInput.trim() || isSubmitting) return;
    setDraftError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      boardId: "onboarding-draft",
      role: "user",
      authorUserId: currentUser.id,
      authorName: currentUser.displayName,
      content: chatInput.trim(),
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...draft.messages, userMessage];
    setDraft((current) => ({ ...current, messages: nextMessages }));
    setIsSubmitting(true);
    const messageToSend = chatInput.trim();
    setChatInput("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "turn",
          message: messageToSend,
          profile: draft.profile,
          messages: draft.messages,
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error || "Unable to continue onboarding.");
      }

      const result = (await response.json()) as {
        profile: SearchProfileData;
        completion: ProfileCompletion;
        assistantMessage: ChatMessage;
      };

      setDraft({
        profile: result.profile,
        completion: result.completion,
        messages: [...nextMessages, result.assistantMessage],
      });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Unable to continue onboarding.");
      setDraft((current) => ({
        ...current,
        messages: [
          ...nextMessages,
          {
            id: `assistant-error-${Date.now()}`,
            boardId: "onboarding-draft",
            role: "assistant",
            authorUserId: null,
            authorName: "Advisor",
            content: "I hit a snag while updating the onboarding profile. Try sending that again.",
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmAndCreateBoard() {
    if (isConfirming || draft.profile.completionStatus !== "complete") return;
    setIsConfirming(true);
    setDraftError(null);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          profile: draft.profile,
        }),
      });

      const result = (await response.json()) as { boardId?: string; error?: string };
      if (!response.ok || !result.boardId) {
        throw new Error(result.error || "Unable to create board.");
      }

      window.sessionStorage.removeItem(STORAGE_KEY);
      router.push(`/boards/${result.boardId}`);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Unable to create board.");
      setIsConfirming(false);
    }
  }

  function resetDraft() {
    const initial = createInitialDraft(currentUser);
    setDraft(initial);
    setChatInput("");
    setDraftError(null);
    window.sessionStorage.removeItem(STORAGE_KEY);
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

        <div className="sidebar-brand">
          <span className="brand-dot" />
          {!isSidebarCollapsed ? (
            <div>
              <strong>{currentUser.displayName}</strong>
              <p>{currentUser.workAddress ? currentUser.workAddress : "No commute anchor yet"}</p>
            </div>
          ) : null}
        </div>

        <div className="sidebar-section">
          {!isSidebarCollapsed && recentBoards.length > 0 ? <div className="sidebar-label">Boards</div> : null}
          <div className="sidebar-board-list">
            {recentBoards.map((board) => (
              <div key={board.id} className="sidebar-board-row">
                <Link href={`/boards/${board.id}`} className="sidebar-board-link">
                  <span>{isSidebarCollapsed ? board.title.slice(0, 1).toUpperCase() : board.title}</span>
                  {!isSidebarCollapsed ? <small>{new Date(board.updatedAt).toLocaleDateString()}</small> : null}
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

      <section className="home-stage">
        <div className="home-stage-inner onboarding-home-stage">
          <div className="home-badge">Onboarding</div>
          <h1>Build the profile first. Confirm it. Then create the shared board.</h1>
          <p>
            This is the pre-board onboarding chat. Once the rental profile feels right, Homeboard will turn it into the actual
            shared board your group uses.
          </p>

          <div className="onboarding-status-row">
            <div className="onboarding-status-card">
              <span>Progress</span>
              <strong>{draft.completion.percentComplete}%</strong>
            </div>
            <div className="onboarding-status-card">
              <span>Completed</span>
              <strong>{completedCount}</strong>
            </div>
            <div className="onboarding-status-card">
              <span>Still needed</span>
              <strong>{missingCount}</strong>
            </div>
          </div>

          {draftError ? <div className="account-message account-message-error">{draftError}</div> : null}

          {showDemoStarter ? (
            <div className="home-starter-row">
              <button type="button" className="secondary-button" onClick={useDemoStarter}>
                Use recent-grad demo
              </button>
            </div>
          ) : null}

          <div className="chat-stage onboarding-chat-stage">
            <div className="chat-thread-modern" ref={chatThreadRef}>
              {draft.messages.map((message) => (
                <article key={message.id} className={`modern-message ${message.role}`}>
                  {message.role === "assistant" ? <div className="avatar">A</div> : null}
                  <div className="message-body">
                    <span className="message-role">{message.role === "assistant" ? "Advisor" : message.authorName ?? "You"}</span>
                    <p>{message.content}</p>
                  </div>
                </article>
              ))}
            </div>

            <form
              ref={formRef}
              className="chat-input-shell"
              onSubmit={(event) => {
                event.preventDefault();
                void submitOnboardingMessage();
              }}
            >
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={4}
                placeholder="Try: I’m moving to NYC in August with two roommates. I want to stay under 1600, maybe 1750 max, and I’ll be commuting to Midtown."
              />
              <div className="chat-input-footer">
                <div className="chat-hints">
                  <span>
                    Profile {draft.completion.percentComplete}% complete
                    {draft.completion.missingFields.length > 0 ? ` · still need ${draft.completion.missingFields.join(", ")}` : ""}
                  </span>
                  <span>Enter sends · Shift+Enter newline · Ctrl/Cmd+Space sends</span>
                </div>
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Send"}
                </button>
              </div>
            </form>
          </div>

          <section className="home-profile-review-card mac-window-card">
            <div className="rail-card-header">
              <h2>Structured profile</h2>
              <span>{draft.profile.completionStatus}</span>
            </div>
            <div className="onboarding-progress-bar" aria-hidden="true">
              <span style={{ width: `${draft.completion.percentComplete}%` }} />
            </div>
            <div className="detail-chip-wrap">
              {profileSummary.map((item) => (
                <span key={item} className="saved-pill">
                  {item}
                </span>
              ))}
            </div>
            <div className="onboarding-review-grid">
              <div className="onboarding-review-block">
                <span>Must-haves</span>
                <strong>{draft.profile.mustHaves.length > 0 ? draft.profile.mustHaves.join(", ") : "Still open"}</strong>
              </div>
              <div className="onboarding-review-block">
                <span>Dealbreakers</span>
                <strong>{draft.profile.dealbreakers.length > 0 ? draft.profile.dealbreakers.join(", ") : "Still open"}</strong>
              </div>
              <div className="onboarding-review-block">
                <span>Priorities</span>
                <strong>{draft.profile.priorities.length > 0 ? draft.profile.priorities.join(", ") : "Still open"}</strong>
              </div>
              <div className="onboarding-review-block">
                <span>Neighborhoods</span>
                <strong>{draft.profile.neighborhoods.length > 0 ? draft.profile.neighborhoods.join(", ") : "Still open"}</strong>
              </div>
            </div>
            <p className="settings-help-copy">
              Completed: {draft.completion.completedFields.length > 0 ? draft.completion.completedFields.join(", ") : "nothing substantial yet"}
            </p>
            {draft.completion.missingFields.length > 0 ? (
              <p className="settings-help-copy">Missing: {draft.completion.missingFields.join(", ")}</p>
            ) : (
              <p className="settings-help-copy">The profile is ready. Confirm it to create the real board and bring your group into it.</p>
            )}
            <div className="register-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={resetDraft}
              >
                Reset draft
              </button>
              <div className="onboarding-action-stack">
                <Link href="/settings" className="secondary-button">
                  Account settings
                </Link>
                <button
                  type="button"
                  className="account-primary-button"
                  disabled={draft.profile.completionStatus !== "complete" || isConfirming}
                  onClick={() => void confirmAndCreateBoard()}
                >
                  {isConfirming ? "Creating board..." : "Confirm profile and create board"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
