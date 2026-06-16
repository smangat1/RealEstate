"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { AuthUserRecord } from "@/lib/types";

type HomeExperienceProps = {
  currentUser: AuthUserRecord;
  recentBoards: Array<{ id: string; title: string; updatedAt: string }>;
  isDemoEnabled: boolean;
  createBoardAction: (formData: FormData) => Promise<void>;
  deleteBoardAction: (formData: FormData) => Promise<void>;
};

export function HomeExperience({ currentUser, recentBoards, isDemoEnabled, createBoardAction, deleteBoardAction }: HomeExperienceProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [homePrompt, setHomePrompt] = useState("");
  const [showDemoStarter, setShowDemoStarter] = useState(isDemoEnabled);
  const formRef = useRef<HTMLFormElement | null>(null);

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

    if (window.sessionStorage.getItem("homeboard-demo-starter-dismissed") === "true") {
      setShowDemoStarter(false);
    }
  }, []);

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
    setHomePrompt("I want a house in New York city area, 2 bedroom, less than 5000, move this July.");
    setShowDemoStarter(false);
    window.sessionStorage.setItem("homeboard-demo-starter-dismissed", "true");
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
        <div className="home-stage-inner">
          <div className="home-badge">Roommate-first rental board</div>
          <h1>Figure out a rental with roommates without losing the plot.</h1>
          <p>
            Start with one natural message. The board turns that into group limits, shared tradeoffs, roommate preference cards,
            shared named chat, and swipeable listing batches from the starter inventory.
          </p>

          {showDemoStarter ? (
            <div className="home-starter-row">
              <button type="button" className="secondary-button" onClick={useDemoStarter}>
                Use scripted demo
              </button>
            </div>
          ) : null}

          <form action={createBoardAction} className="home-chat-entry" ref={formRef}>
            <input type="hidden" name="title" value="" />
            <textarea
              name="initialPrompt"
              rows={5}
              placeholder="Tell the board what your group wants."
              value={homePrompt}
              onChange={(event) => setHomePrompt(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <div className="home-chat-footer">
              <span>Enter sends. Shift+Enter makes a new line. Ctrl/Cmd+Space also sends.</span>
              <button type="submit">Start search</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
